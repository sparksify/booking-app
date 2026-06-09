/**
 * GET /api/dashboard/transfer-check?target=<repEmail>
 *
 * Returns the logged-in user's upcoming scheduled appointments, each flagged
 * with whether the target rep has a calendar conflict at that time. Conflict
 * detection uses the target rep's Google free/busy.
 *
 * Response: {
 *   target: { email, name, has_calendar },
 *   appointments: [{ id, name, email, phone, slot_start, slot_end,
 *                    date_label, time_label, conflict }]
 * }
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBusyTimes } from '@/lib/googleCalendar';

function localDate(iso, tz) {
  // en-CA renders YYYY-MM-DD
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

  // Settings (timezone)
  const { data: settingsRow } = await supabase
    .from('settings').select('timezone').eq('id', 1).single();
  const tz = settingsRow?.timezone || 'America/Chicago';

  // Target rep
  const { data: targetMember } = await supabase
    .from('team_members')
    .select('email, name, google_access_token, google_refresh_token, calendar_id')
    .ilike('email', target)
    .maybeSingle();

  if (!targetMember) return res.status(404).json({ error: 'Target rep not found' });
  const hasCalendar = !!targetMember.google_refresh_token;

  // My upcoming scheduled appointments (native bookings only — these are the
  // ones whose calendar event we control)
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('bookings')
    .select('id, first_name, last_name, email, phone, slot_start, slot_end, google_event_id, investment_level, meet_link, status')
    .ilike('assigned_to_email', me)
    .eq('status', 'scheduled')
    .gte('slot_start', nowIso)
    .order('slot_start', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const bookings = rows || [];

  // Build busy map for each distinct local date the target rep needs checking
  const busyByDate = {};
  if (hasCalendar && bookings.length) {
    const dates = [...new Set(bookings.map(b => localDate(b.slot_start, tz)))];
    await Promise.all(dates.map(async d => {
      try {
        busyByDate[d] = await getBusyTimes([targetMember], d, tz);
      } catch {
        busyByDate[d] = [];
      }
    }));
  }

  const appointments = bookings.map(b => {
    const bs = Date.parse(b.slot_start);
    const be = b.slot_end ? Date.parse(b.slot_end) : bs + 15 * 60_000;
    const d  = localDate(b.slot_start, tz);
    const busy = busyByDate[d] || [];
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
