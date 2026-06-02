import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent } from '@/lib/googleCalendar';
import { sendConfirmationEmail } from '@/lib/resend';
import { sendCapiEvents, buildCapiEvent } from '@/lib/fbConversionsApi';
import { upsertGHLContact, createGHLOpportunity } from '@/lib/ghl';
import { computeLeadScore, computeShowProbability } from '@/lib/scoring';
import { logLeadEvent } from '@/lib/leadEvents';
import { wasEngagedByCloseBot } from '@/lib/closebot';

// Appointment Scheduling pipeline
const GHL_PIPELINE_ID  = 'tOlnnAijaReLJ30AZaSL';
const GHL_STAGE_BOOKED = '34c03355-1c6a-4532-b2e5-f080f4263807';

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
    source,
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

  // ── Resolve or create lead record ────────────────────────────────────────────
  // Ensures every booking — whether from a token link or a direct Facebook ad
  // redirect — has a corresponding row in the leads table.
  let resolvedLeadDbId = null; // UUID of the leads row

  if (lead_id) {
    // Token-based path: lead already exists, just look up its UUID
    const { data: lr } = await supabase
      .from('leads').select('id').eq('token', lead_id).maybeSingle();
    resolvedLeadDbId = lr?.id || null;
  } else if (email) {
    // Direct URL path (Facebook ad redirect with pre-filled params):
    // find an existing lead by email or create one now.
    const { data: existing } = await supabase
      .from('leads').select('id')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (existing) {
      resolvedLeadDbId = existing.id;
    } else {
      const newToken = crypto.randomBytes(12).toString('hex');
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          token:            newToken,
          first_name:       firstName || null,
          last_name:        lastName  || null,
          email:            email     || null,
          phone:            phone     || null,
          investment_level: investment_level || null,
          raw_fields:       { source: 'booking_page_direct' },
          status:           'new',
          updated_at:       new Date().toISOString(),
        })
        .select('id').single();
      resolvedLeadDbId = newLead?.id || null;
    }
  }

  // ── Attribution: auto-detect CloseBot if no explicit source ─────────────────
  let resolvedSource = source || (lead_id ? 'facebook_lead' : null);
  if (!resolvedSource && process.env.CLOSEBOT_API_KEY) {
    try {
      const cb = await wasEngagedByCloseBot(phone, `${firstName} ${lastName || ''}`.trim());
      if (cb) resolvedSource = 'closebot';
    } catch { /* non-blocking */ }
  }
  resolvedSource = resolvedSource || 'direct';

  // ── Lead scoring ─────────────────────────────────────────────────────────────
  const bookingForScoring = {
    slot_start:       new Date(startMs).toISOString(),
    created_at:       new Date().toISOString(),
    investment_level: investment_level || null,
    fb_attribution:   fb_attribution   || null,
    phone, email, first_name: firstName, last_name: lastName,
  };
  const leadScore      = computeLeadScore(bookingForScoring, null);
  const showProbability = computeShowProbability(bookingForScoring, null);

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
    lead_score:        leadScore,
    show_probability:  showProbability,
    booking_source:    resolvedSource,
    lead_id:           resolvedLeadDbId,
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

  // ── GHL opportunity ─────────────────────────────────────────────────────────
  // Create (or find) a GHL contact and open an opportunity in the
  // "Appointment Scheduling" pipeline at the "Booked Appointment" stage.
  if (process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID) {
    (async () => {
      try {
        let ghlContactId = null;

        // Check if the lead record already has a GHL contact ID
        if (resolvedLeadDbId) {
          const { data: leadRow } = await supabase
            .from('leads')
            .select('ghl_contact_id')
            .eq('id', resolvedLeadDbId)
            .maybeSingle();
          ghlContactId = leadRow?.ghl_contact_id ?? null;
        }

        // Fall back to upsert (handles direct bookings / new leads with no GHL contact yet)
        if (!ghlContactId) {
          const contact = await upsertGHLContact({
            locationId: process.env.GHL_LOCATION_ID,
            firstName, lastName, email, phone,
            tags:   ['booking-app'],
            source: 'BookingOS',
          });
          ghlContactId = contact?.id ?? null;
        }

        if (ghlContactId) {
          const opp = await createGHLOpportunity({
            contactId:  ghlContactId,
            name:       `${firstName} ${lastName || ''} — Discovery Call`.trim(),
            pipelineId: GHL_PIPELINE_ID,
            stageId:    GHL_STAGE_BOOKED,
          });

          // Persist IDs back onto the booking so status updates can use them
          if (bookingId) {
            await supabase.from('bookings').update({
              ghl_opportunity_id: opp?.id    ?? null,
              ghl_contact_id:     ghlContactId,
            }).eq('id', bookingId);
          }

          // Stamp the lead record with GHL contact ID + booked status
          if (resolvedLeadDbId) {
            await supabase.from('leads').update({
              ghl_contact_id: ghlContactId,
              status:         'booked',
              updated_at:     new Date().toISOString(),
            }).eq('id', resolvedLeadDbId);
          }
        }
      } catch (err) {
        console.error('[book] GHL opportunity error:', err.message);
      }
    })();
  }

  // ── Log appointment_booked event ─────────────────────────────────────────────
  if (email) {
    logLeadEvent(email, 'appointment_booked', {
      booking_source:   resolvedSource,
      slot_start:       new Date(startMs).toISOString(),
      assigned_to:      assignedEmail || null,
      investment_level: investment_level || null,
      meet_link:        meetLink || null,
    }, {
      leadId:    lead_id || null,
      bookingId: bookingId || null,
    }).catch(() => {});
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
