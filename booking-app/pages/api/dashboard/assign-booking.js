/**
 * POST /api/dashboard/assign-booking
 * Body: { bookingId, email, slot_start, first_name, last_name, phone, meet_link,
 *         investment_level, repEmail }
 *
 * Assigns (or reassigns) a meeting to a rep — used for leads that came in
 * unassigned, or to move a meeting to a different rep. It:
 *   1. Puts the appointment on the rep's Google Calendar (silent — no client comms).
 *   2. Sets the assignment: native bookings update in place; Calendly/GHL meetings
 *      get a meeting_transfers record (applied when the meetings list is built).
 *   3. Sets the GHL contact owner so the rep's CQ / no-show workflows fire for them.
 *
 * Unlike Transfer, it does not gray a previous rep's calendar event (assign is for
 * unassigned leads or a straight reassignment).
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createSilentCalendarEvent } from '@/lib/googleCalendar';
import { lookupGHLContactByEmail, getGHLUserIdByEmail, updateGHLContactOwner } from '@/lib/ghl';
import { getPermissions } from '@/lib/role';
import { normalizeRepName } from '@/pages/api/dashboard/bookings';

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

  const perms = await getPermissions(session.user?.email);
  if (!perms.transfer_appointments) {
    return res.status(403).json({ error: 'You do not have permission to assign meetings.' });
  }

  const {
    bookingId, email, slot_start,
    first_name, last_name, phone, meet_link, investment_level,
    repEmail,
  } = req.body || {};
  const rep = (repEmail || '').toString().trim().toLowerCase();
  if (!rep)        return res.status(400).json({ error: 'repEmail required' });
  if (!email || !slot_start) return res.status(400).json({ error: 'email and slot_start required' });

  const supabase = getSupabaseAdmin();

  const { data: settingsRow } = await supabase
    .from('settings').select('timezone, meeting_title, meeting_duration').eq('id', 1).single();
  const tz = settingsRow?.timezone || 'America/Chicago';
  const meetingTitle = settingsRow?.meeting_title || 'Discovery Call';

  const { data: targetMember } = await supabase
    .from('team_members')
    .select('email, name, google_access_token, google_refresh_token, calendar_id, ghl_user_id')
    .ilike('email', rep).maybeSingle();
  if (!targetMember) return res.status(404).json({ error: 'Rep not found' });

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId || '');
  const warnings = [];

  // 1. Put the meeting on the rep's calendar (silent — client is not notified).
  let eventId = null;
  if (targetMember.google_refresh_token) {
    try {
      const { date, h, m } = localParts(slot_start, tz);
      const durationMins = settingsRow?.meeting_duration || 15;
      const { eventId: id } = await createSilentCalendarEvent(
        targetMember,
        { firstName: first_name, lastName: last_name, email, phone, date, h, m, meetLink: meet_link, investmentLevel: investment_level, title: meetingTitle, fromName: 'KANSO' },
        { meetingDuration: durationMins, timezone: tz }
      );
      eventId = id;
    } catch (e) { warnings.push(`calendar: ${e.message}`); }
  } else {
    warnings.push('rep has no connected Google Calendar');
  }

  // 2. Persist the assignment.
  if (isUuid) {
    const { error } = await supabase
      .from('bookings')
      .update({ assigned_to_email: targetMember.email, transfer_event_id: eventId, transferred_at: new Date().toISOString() })
      .eq('id', bookingId);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    // Calendly/GHL — reassign via meeting_transfers (no unique constraint, so
    // clear any prior record for this meeting first).
    await supabase.from('meeting_transfers')
      .delete().ilike('client_email', email).eq('slot_start', slot_start);
    const { error } = await supabase.from('meeting_transfers').insert({
      client_email: email, slot_start,
      from_email: session.user?.email || 'dashboard',
      to_email: targetMember.email, to_event_id: eventId,
    });
    if (error) return res.status(500).json({ error: error.message });
  }

  // 3. Set the GHL contact owner so workflows fire for the assigned rep.
  try {
    let ghlUserId = targetMember.ghl_user_id || null;
    if (!ghlUserId) { try { ghlUserId = await getGHLUserIdByEmail(targetMember.email); } catch { /* ignore */ } }
    if (ghlUserId && process.env.GHL_API_KEY) {
      const contact = await lookupGHLContactByEmail(email).catch(() => null);
      if (contact?.id) await updateGHLContactOwner(contact.id, ghlUserId);
      else warnings.push('GHL contact not found for owner update');
    } else if (!ghlUserId) {
      warnings.push('could not resolve GHL user for owner update');
    }
  } catch (e) { warnings.push(`GHL owner: ${e.message}`); }

  // For the UI: native rows show the email; Calendly/GHL rows show the normalized
  // name (that's how the meetings list renders their assignment).
  const assigned_to_email = isUuid ? targetMember.email : normalizeRepName(targetMember.email);

  return res.json({ ok: true, assigned_to_email, name: targetMember.name, warnings: warnings.length ? warnings : undefined });
}
