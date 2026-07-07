import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/create-booking
 *
 * Lightweight manual "quick add call" — logs a call/appointment straight into
 * the Supabase `bookings` table so it shows up on the Meetings dashboard with a
 * KANSO source badge. Deliberately silent: no rep routing, no Google Calendar
 * event, no confirmation email, no GHL opportunity. For that heavier flow use
 * the public /api/book endpoint.
 *
 * Body: {
 *   firstName (required), lastName?, email?, phone?,
 *   date (YYYY-MM-DD, required), h (0-23, required), m (0-59, required),
 *   durationMins?, assigned_to_email?, ghl_contact_id?, investment_level?, notes?
 * }
 * At least one of email / phone should be provided.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const {
    firstName, lastName = '', email = '', phone = '',
    date, h, m, durationMins,
    assigned_to_email, ghl_contact_id, investment_level, notes,
  } = req.body || {};

  if (!firstName || !date || h == null || m == null) {
    return res.status(400).json({ error: 'Missing required fields (name, date, time)' });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: 'Provide an email or a phone number' });
  }

  const supabase = getSupabaseAdmin();

  // Meeting timezone + default duration come from global settings.
  const { data: settingsRow } = await supabase
    .from('settings').select('timezone, meeting_duration').eq('id', 1).single();
  const timezone = settingsRow?.timezone || 'America/Chicago';
  const duration = Number(durationMins) || settingsRow?.meeting_duration || 15;

  // Convert the local wall-clock slot to UTC using the settings timezone.
  const [sy, smo, sd] = String(date).split('-').map(Number);
  const offsetMins = getOffsetMinutes(date, timezone);
  const startMs = Date.UTC(sy, smo - 1, sd, Number(h), Number(m), 0) - offsetMins * 60_000;
  const endMs   = startMs + duration * 60_000;

  // Default the assigned rep to whoever is adding the call.
  const assignedEmail = assigned_to_email || session.user?.email || null;

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      first_name:        firstName,
      last_name:         lastName || '',
      email:             email || null,
      phone:             phone || null,
      slot_start:        new Date(startMs).toISOString(),
      slot_end:          new Date(endMs).toISOString(),
      assigned_to_email: assignedEmail,
      status:            'scheduled',
      booking_source:    'manual',
      investment_level:  investment_level || null,
      ghl_contact_id:    ghl_contact_id || null,
      notes:             notes || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[create-booking] insert error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, bookingId: data.id });
}

// UTC offset (minutes) for a timezone on a given date — e.g. -300 for CDT.
// Uses noon as a DST-safe probe. Mirrors the helper in /api/book.js.
function getOffsetMinutes(dateStr, timezone) {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const str = probe.toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' });
  const match = str.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign  = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const mins  = parseInt(match[3] || '0', 10);
  return sign * (hours * 60 + mins);
}
