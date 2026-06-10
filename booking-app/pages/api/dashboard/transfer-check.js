/**
 * GET /api/dashboard/transfer-check?target=<repEmail>
 *
 * Returns the logged-in rep's REAL upcoming meetings (native KANSO + Calendly +
 * GoHighLevel — the same list they see on the Meetings page), each flagged with
 * whether the target rep has a calendar conflict at that time. Conflict
 * detection uses the target rep's Google free/busy.
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBusyTimesRange } from '@/lib/googleCalendar';
import { getRepUpcomingMeetings } from '@/lib/transferable';

function localDate(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
function dateLabel(iso, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
}
function timeLabel(iso, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const me     = session.user?.email;
  const target = (req.query.target || '').toString().trim().toLowerCase();
  if (!me)     return res.status(400).json({ error: 'No session email' });
  if (!target) return res.status(400).json({ error: 'target rep required' });
  if (target === me.toLowerCase()) return res.status(400).json({ error: 'Cannot transfer to yourself' });

  const supabase = getSupabaseAdmin();

  const { data: settingsRow } = await supabase
    .from('settings').select('timezone').eq('id', 1).single();
  const tz = settingsRow?.timezone || 'America/Chicago';

  const { data: targetMember } = await supabase
    .from('team_members')
    .select('email, name, google_access_token, google_refresh_token, calendar_id')
    .ilike('email', target)
    .maybeSingle();
  if (!targetMember) return res.status(404).json({ error: 'Target rep not found' });
  const hasCalendar = !!targetMember.google_refresh_token;

  // The rep's real upcoming meetings, from every source.
  let meetings = [];
  try { meetings = await getRepUpcomingMeetings(me); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  // Target rep's busy times across the window (one free/busy call).
  let busy = [];
  if (hasCalendar && meetings.length) {
    const fromD = localDate(meetings[0].slot_start, tz);
    const toD   = localDate(meetings[meetings.length - 1].slot_start, tz);
    try { busy = await getBusyTimesRange([targetMember], fromD, toD, tz); }
    catch { busy = []; }
  }

  const appointments = meetings.map(b => {
    const bs = Date.parse(b.slot_start);
    const be = b.slot_end ? Date.parse(b.slot_end) : bs + 15 * 60_000;
    const conflict = busy.some(x => {
      const xs = Date.parse(x.start), xe = Date.parse(x.end);
      return bs < xe && be > xs;
    });
    return {
      id:         b.id,
      name:       `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.email,
      email:      b.email,
      phone:      b.phone || null,
      slot_start: b.slot_start,
      slot_end:   b.slot_end,
      source:     b._source_display || null,
      date_label: dateLabel(b.slot_start, tz),
      time_label: timeLabel(b.slot_start, tz),
      conflict,
    };
  });

  return res.json({
    target: { email: targetMember.email, name: targetMember.name, has_calendar: hasCalendar },
    appointments,
  });
}
