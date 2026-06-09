/**
 * POST /api/dashboard/transfer-bookings
 * Body: { targetEmail, bookingIds: [uuid, ...] }
 *
 * Reassigns the given appointments (which must belong to the logged-in user)
 * to the target rep:
 *   1. Creates a silent copy on the target rep's Google Calendar (client is NOT
 *      notified — they never see the reassignment). The original Meet link is
 *      embedded so the new rep can join the existing call.
 *   2. Grays out (recolors) the original event on the source rep's calendar.
 *   3. Updates Kanso assignment (assigned_to_email) so it shows in the new rep's
 *      dashboard.
 *   4. Reassigns the GHL contact owner (best-effort).
 *
 * Returns per-appointment results with any non-fatal warnings.
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createSilentCalendarEvent, recolorCalendarEvent } from '@/lib/googleCalendar';
import { getGHLUserIdByEmail, updateGHLContactOwner } from '@/lib/ghl';

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

  // Settings
  const { data: settingsRow } = await supabase
    .from('settings').select('timezone, meeting_title, meeting_duration').eq('id', 1).single();
  const tz = settingsRow?.timezone || 'America/Chicago';
  const meetingTitle = settingsRow?.meeting_title || 'Discovery Call';

  // Target + source members
  const [{ data: targetMember }, { data: sourceMember }] = await Promise.all([
    supabase.from('team_members')
      .select('email, name, google_access_token, google_refresh_token, calendar_id, ghl_user_id')
      .ilike('email', target).maybeSingle(),
    supabase.from('team_members')
      .select('email, name, google_access_token, google_refresh_token, calendar_id')
      .ilike('email', me).maybeSingle(),
  ]);

  if (!targetMember) return res.status(404).json({ error: 'Target rep not found' });

  // Resolve target GHL user id once (best-effort)
  let targetGhlUserId = targetMember.ghl_user_id || null;
  if (!targetGhlUserId) {
    try { targetGhlUserId = await getGHLUserIdByEmail(targetMember.email); } catch { /* ignore */ }
  }

  const results = [];

  for (const id of bookingIds) {
    const warnings = [];
    try {
      const { data: b } = await supabase
        .from('bookings')
        .select('id, first_name, last_name, email, phone, slot_start, slot_end, google_event_id, investment_level, meet_link, assigned_to_email, ghl_contact_id, status')
        .eq('id', id)
        .maybeSingle();

      if (!b) { results.push({ id, ok: false, error: 'Not found' }); continue; }
      if ((b.assigned_to_email || '').toLowerCase() !== me.toLowerCase()) {
        results.push({ id, ok: false, error: 'Not your appointment' }); continue;
      }

      const { date, h, m } = localParts(b.slot_start, tz);
      const durationMins = b.slot_end
        ? Math.max(5, Math.round((Date.parse(b.slot_end) - Date.parse(b.slot_start)) / 60_000))
        : (settingsRow?.meeting_duration || 15);

      // 1. Silent copy on target's calendar
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

      // 2. Gray out original event on source calendar
      if (b.google_event_id && sourceMember?.google_refresh_token) {
        try {
          await recolorCalendarEvent(sourceMember, b.google_event_id, '8');
        } catch (e) {
          warnings.push(`recolor failed: ${e.message}`);
        }
      }

      // 3. Update Kanso assignment
      const { error: upErr } = await supabase
        .from('bookings')
        .update({
          assigned_to_email:     targetMember.email,
          transferred_from_email: me,
          transferred_at:        new Date().toISOString(),
          transfer_event_id:     transferEventId,
        })
        .eq('id', id);
      if (upErr) { results.push({ id, ok: false, error: upErr.message, warnings }); continue; }

      // 4. GHL owner reassignment (best-effort)
      if (b.ghl_contact_id && targetGhlUserId) {
        try { await updateGHLContactOwner(b.ghl_contact_id, targetGhlUserId); }
        catch (e) { warnings.push(`GHL reassign failed: ${e.message}`); }
      } else if (b.ghl_contact_id && !targetGhlUserId) {
        warnings.push('could not resolve target GHL user — GHL owner unchanged');
      }

      results.push({ id, ok: true, warnings });
    } catch (e) {
      results.push({ id, ok: false, error: e.message, warnings });
    }
  }

  const transferred = results.filter(r => r.ok).length;
  return res.json({ ok: true, transferred, total: bookingIds.length, target: targetMember.email, results });
}
