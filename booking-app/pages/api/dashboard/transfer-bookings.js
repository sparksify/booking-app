/**
 * POST /api/dashboard/transfer-bookings
 * Body: { targetEmail, bookingIds: [id, ...] }
 *
 * Reassigns the logged-in rep's selected meetings (native KANSO + Calendly + GHL)
 * to the target rep, with NO client-facing side effects:
 *   1. Creates a silent copy on the target rep's Google Calendar (client is NOT
 *      invited; sendUpdates: 'none'). The original Meet link is embedded.
 *   2. Grays out the original event on the source rep's calendar (kept, not
 *      cancelled — so existing reminders to the client keep flowing).
 *   3. Persists the reassignment so the meeting moves to the new rep's dashboard:
 *      native rows are updated in place; Calendly/GHL meetings get a
 *      meeting_transfers record (applied when the Meetings list is built).
 *
 * Intentionally does NOT cancel the original, invite the client, or touch GHL
 * ownership/workflows — last-minute hand-offs must not trigger any client comms.
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createSilentCalendarEvent, recolorCalendarEvent, findCalendarEventId } from '@/lib/googleCalendar';
import { getRepUpcomingMeetings } from '@/lib/transferable';

function localParts(iso, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(new Date(iso));
  const get = t => parts.find(p => p.type === t)?.value;
  let hour = get('hour'); if (hour === '24') hour = '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, h: parseInt(hour, 10), m: parseInt(get('minute'), 10) };
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const me = session.user?.email;
  const { targetEmail, bookingIds } = req.body || {};
  const target = (targetEmail || '').toString().trim().toLowerCase();

  if (!me)     return res.status(400).json({ error: 'No session email' });
  if (!target) return res.status(400).json({ error: 'targetEmail required' });
  if (target === me.toLowerCase()) return res.status(400).json({ error: 'Cannot transfer to yourself' });
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return res.status(400).json({ error: 'bookingIds required' });
  }

  const supabase = getSupabaseAdmin();

  const { data: settingsRow } = await supabase
    .from('settings').select('timezone, meeting_title, meeting_duration').eq('id', 1).single();
  const tz = settingsRow?.timezone || 'America/Chicago';
  const meetingTitle = settingsRow?.meeting_title || 'Discovery Call';

  const [{ data: targetMember }, { data: sourceMember }] = await Promise.all([
    supabase.from('team_members')
      .select('email, name, google_access_token, google_refresh_token, calendar_id')
      .ilike('email', target).maybeSingle(),
    supabase.from('team_members')
      .select('email, name, google_access_token, google_refresh_token, calendar_id')
      .ilike('email', me).maybeSingle(),
  ]);
  if (!targetMember) return res.status(404).json({ error: 'Target rep not found' });

  // Resolve the selected meetings from the rep's real upcoming list (security:
  // only meetings that genuinely belong to this rep can be transferred).
  let meetings = [];
  try { meetings = await getRepUpcomingMeetings(me); }
  catch (e) { return res.status(500).json({ error: e.message }); }
  const byId = new Map(meetings.map(m => [String(m.id), m]));

  const results = [];

  for (const id of bookingIds) {
    const warnings = [];
    try {
      const b = byId.get(String(id));
      if (!b) { results.push({ id, ok: false, error: 'Not found or not yours' }); continue; }

      const isNative = !String(id).startsWith('cal_') && !String(id).startsWith('ghl_');
      const { date, h, m } = localParts(b.slot_start, tz);
      const durationMins = b.slot_end
        ? Math.max(5, Math.round((Date.parse(b.slot_end) - Date.parse(b.slot_start)) / 60_000))
        : (settingsRow?.meeting_duration || 15);

      // 1. Silent copy on the target's calendar — no client invite/notification.
      let transferEventId = null;
      if (targetMember.google_refresh_token) {
        try {
          const { eventId } = await createSilentCalendarEvent(
            targetMember,
            {
              firstName: b.first_name, lastName: b.last_name, email: b.email, phone: b.phone,
              date, h, m, meetLink: b.meet_link, investmentLevel: b.investment_level,
              title: meetingTitle, fromName: sourceMember?.name || me,
            },
            { meetingDuration: durationMins, timezone: tz }
          );
          transferEventId = eventId;
        } catch (e) {
          warnings.push(`calendar copy failed: ${e.message}`);
        }
      } else {
        warnings.push('target rep has no connected Google Calendar');
      }

      // 2. Gray the original on the source rep's calendar (kept, not cancelled).
      let grayedEventId = null;
      if (sourceMember?.google_refresh_token) {
        let srcEventId = null;
        if (isNative) {
          const { data: row } = await supabase
            .from('bookings').select('google_event_id').eq('id', id).maybeSingle();
          srcEventId = row?.google_event_id || null;
        } else {
          const bs = new Date(b.slot_start).getTime();
          srcEventId = await findCalendarEventId(sourceMember, {
            fromIso:    new Date(bs - 5 * 60_000).toISOString(),
            toIso:      new Date(bs + (durationMins + 5) * 60_000).toISOString(),
            matchEmail: b.email,
            matchName:  `${b.first_name || ''} ${b.last_name || ''}`.trim(),
          });
        }
        if (srcEventId) {
          try { await recolorCalendarEvent(sourceMember, srcEventId, '8'); grayedEventId = srcEventId; }
          catch (e) { warnings.push(`gray failed: ${e.message}`); }
        } else {
          warnings.push('could not find the original event to gray on your calendar');
        }
      }

      // 3. Persist the reassignment so the meeting moves to the new rep.
      if (isNative) {
        const { error: upErr } = await supabase
          .from('bookings')
          .update({
            assigned_to_email:      targetMember.email,
            transferred_from_email: me,
            transferred_at:         new Date().toISOString(),
            transfer_event_id:      transferEventId,
          })
          .eq('id', id);
        if (upErr) { results.push({ id, ok: false, error: upErr.message, warnings }); continue; }
      } else {
        const { error: insErr } = await supabase
          .from('meeting_transfers')
          .insert({
            client_email:  b.email || null,
            slot_start:    b.slot_start,
            from_email:    me,
            to_email:      targetMember.email,
            to_event_id:   transferEventId,
            from_event_id: grayedEventId,
          });
        if (insErr) { results.push({ id, ok: false, error: insErr.message, warnings }); continue; }
      }

      results.push({ id, ok: true, warnings });
    } catch (e) {
      results.push({ id, ok: false, error: e.message, warnings });
    }
  }

  const transferred = results.filter(r => r.ok).length;
  return res.json({ ok: true, transferred, total: bookingIds.length, target: targetMember.email, results });
}
