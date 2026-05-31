import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent } from '@/lib/googleCalendar';
import { sendConfirmationEmail } from '@/lib/resend';
import { sendCapiEvents, buildCapiEvent } from '@/lib/fbConversionsApi';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Returns UTC offset in minutes for a timezone on a given date (e.g. -300 for CDT)
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

/**
 * POST /api/book
 *
 * Body: { firstName, lastName, email, phone, date, h, m, label, investment_level?, fb_attribution? }
 *
 * Routing logic:
 *   1. Filter active reps to those whose investment_ranges includes the lead's level
 *      (reps with an empty investment_ranges array handle ALL levels as a fallback).
 *   2. Among matching reps, pick the one with the fewest bookings today (round-robin).
 *   3. Create a Google Calendar event on their calendar.
 *   4. Save booking to Supabase with status = 'scheduled'.
 *   5. Email the lead a confirmation.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    firstName, lastName, email, phone,
    date, h, m, label,
    investment_level,
    fb_attribution,
    lead_id,
  } = req.body;

  if (!firstName || !email || !date || h == null || m == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const supabase = getSupabaseAdmin();

  // ── Settings ────────────────────────────────────────────────────────────────
  const { data: settingsRow } = await supabase
    .from('settings').select('*').eq('id', 1).single();

  const settings = {
    meetingDuration: settingsRow?.meeting_duration ?? 15,
    meetingTitle:    settingsRow?.meeting_title    ?? 'Franchise Discovery Call',
    timezone:        settingsRow?.timezone         ?? 'America/Chicago',
  };

  // ── Load & filter team members ───────────────────────────────────────────────
  const { data: allMembers } = await supabase
    .from('team_members')
    .select('*')
    .eq('active', true)
    .not('google_refresh_token', 'is', null);

  // Filter by investment level: reps with empty ranges handle all levels
  const candidates = filterByInvestmentLevel(allMembers || [], investment_level);

  // Fallback: if no specialist reps match, use all active reps
  const members = candidates.length > 0 ? candidates : (allMembers || []);

  let meetLink      = null;
  let eventId       = null;
  let assignedEmail = null;
  let assignedName  = null;

  if (members.length) {
    // Round-robin: pick member with fewest bookings today
    const { data: todayBookings } = await supabase
      .from('bookings')
      .select('assigned_to_email')
      .gte('slot_start', `${date}T00:00:00Z`)
      .lte('slot_start', `${date}T23:59:59Z`);

    const counts = Object.fromEntries(members.map(m => [m.email, 0]));
    (todayBookings || []).forEach(b => {
      if (b.assigned_to_email && counts[b.assigned_to_email] != null) {
        counts[b.assigned_to_email]++;
      }
    });

    const member  = members.reduce((a, b) => counts[a.email] <= counts[b.email] ? a : b);
    assignedEmail = member.email;
    assignedName  = member.name;

    try {
      const result = await createCalendarEvent(
        member,
        { firstName, lastName, email, phone, date, h, m },
        settings
      );
      eventId  = result.eventId;
      meetLink = result.meetLink;
    } catch (err) {
      console.error('[book] createCalendarEvent error:', err.message);
    }
  }

  // ── Save to Supabase ────────────────────────────────────────────────────────
  // Convert local slot time to correct UTC using the settings timezone
  const [sy, smo, sd] = date.split('-').map(Number);
  const offsetMins = getOffsetMinutes(date, settings.timezone);
  const startMs = Date.UTC(sy, smo - 1, sd, h, m, 0) - offsetMins * 60_000;
  const endMs   = startMs + settings.meetingDuration * 60_000;

  const { error: dbError } = await supabase.from('bookings').insert({
    first_name:        firstName,
    last_name:         lastName,
    email,
    phone,
    slot_start:        new Date(startMs).toISOString(),
    slot_end:          new Date(endMs).toISOString(),
    assigned_to_email: assignedEmail,
    google_event_id:   eventId,
    meet_link:         meetLink,
    status:            'scheduled',
    investment_level:  investment_level || null,
    fb_attribution:    fb_attribution   || null,
  });

  if (dbError) console.error('[book] db insert error:', dbError);

  // Get the inserted booking ID for event tracking
  let bookingId = null;
  if (!dbError) {
    const { data: inserted } = await supabase
      .from('bookings')
      .select('id')
      .eq('email', email)
      .eq('slot_start', new Date(startMs).toISOString())
      .single();
    bookingId = inserted?.id || null;
  }

  // ── Facebook Conversions API — Schedule event ───────────────────────────────
  sendCapiEvents([
    buildCapiEvent('Schedule', {
      email,
      phone,
      sourceUrl: `${process.env.NEXTAUTH_URL || ''}/`,
      customData: {
        content_name:     'Franchise Discovery Call',
        content_category: 'Franchise Consulting',
        value:            0,
        currency:         'USD',
      },
    }),
  ]).catch(err => console.error('[book] CAPI error:', err.message));

  // ── Send confirmation email ─────────────────────────────────────────────────
  if (process.env.RESEND_API_KEY) {
    try {
      const d         = new Date(date + 'T12:00:00');
      const dateLabel = `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;

      await sendConfirmationEmail({
        to:        email,
        firstName,
        dateLabel,
        timeLabel: label,
        meetLink,
        hostName:  assignedName || process.env.NEXT_PUBLIC_HOST_NAME || 'Your Consultant',
        duration:  settings.meetingDuration,
      });
    } catch (err) {
      console.error('[book] sendConfirmationEmail error:', err.message);
    }
  }

  res.json({ success: true, meetLink, bookingId });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterByInvestmentLevel(members, investmentLevel) {
  if (!investmentLevel) return members;
  return members.filter(m => {
    const ranges = m.investment_ranges;
    if (!ranges || ranges.length === 0) return true; // handles all levels
    return ranges.includes(investmentLevel);
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}
