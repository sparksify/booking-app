import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  addGHLTags,
  lookupGHLContactByEmail,
  getGHLContactOpportunity,
  updateGHLOpportunityStage,
  updateGHLAppointmentStatus,
} from '@/lib/ghl';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

async function triggerWorkflow(contactId, workflowId) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !contactId || !workflowId) return;
  const res = await fetch(`${GHL_API}/contacts/${contactId}/workflow/${workflowId}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version':       GHL_VERSION,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ eventStartTime: '' }),
  });
  if (!res.ok) {
    // 401/403 here usually means the token lacks the workflows scope.
    const text = await res.text().catch(() => '');
    throw new Error(`addToWorkflow failed ${res.status}: ${text}`);
  }
}
import { logLeadEvent } from '@/lib/leadEvents';

/**
 * POST /api/dashboard/update-booking-status
 *
 * Body: { bookingId, email, status }
 *   status: 'showed' | 'no-show' | 'closed'
 *
 * Actions:
 *   1. Update bookings.status in Supabase
 *   2. Update leads.status in Supabase (matched by email)
 *   3. Add GHL tag
 *   4. Update GHL opportunity stage in "Appointment Scheduling" pipeline
 */

// "Appointment Scheduling" pipeline stage IDs
const GHL_STAGE_NO_SHOW = 'ed181db7-c6b9-4a47-8814-1be6ab10f8b1';
const GHL_STAGE_CLOSED  = '435ab3d7-8889-4b16-b72f-0ae633e0cff6';
// "Showed" has no explicit stage — lead stays at Booked Appointment until CQ is sent

const STATUS_MAP = {
  showed:           { tag: 'showed',         leadStatus: 'showed',         stageId: null,              apptStatus: 'showed' },
  'no-show':        { tag: 'no-show',        leadStatus: 'no-show',        stageId: GHL_STAGE_NO_SHOW, apptStatus: 'noshow' },
  closed:           { tag: 'closed-won',     leadStatus: 'qualified',      stageId: GHL_STAGE_CLOSED,  apptStatus: null     },
  // Not interested = closed lost. Tag it; don't touch the appointment (they showed).
  'not-interested': { tag: 'not-interested', leadStatus: 'not-interested', stageId: null,              apptStatus: null     },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { bookingId, email, status, assigned_user_id, slot_start } = req.body;
  if (!bookingId || !email || !status) {
    return res.status(400).json({ error: 'Missing bookingId, email, or status' });
  }
  if (!STATUS_MAP[status]) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  const { tag, leadStatus, stageId, apptStatus } = STATUS_MAP[status];
  const supabase = getSupabaseAdmin();
  const errors   = [];

  // Booking id schemes: native = uuid, GHL = `ghl_<eventId>`, Calendly = `cal_<uuid>`.
  const isGhlBooking  = typeof bookingId === 'string' && bookingId.startsWith('ghl_');
  const ghlEventId    = isGhlBooking ? bookingId.slice(4) : null;
  const isUuidBooking = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId);

  // 1. Source-agnostic persistence: record a status override keyed by email + slot
  //    so the meetings list reflects this status no matter the booking source
  //    (Calendly and GHL rows have no row in the bookings table). The bookings
  //    API applies this override to whichever source wins dedup.
  if (slot_start) {
    const { error: ovrErr } = await supabase
      .from('meeting_status_overrides')
      .upsert(
        { email, slot_start, status, updated_by: session.user?.email || 'dashboard', updated_at: new Date().toISOString() },
        { onConflict: 'email,slot_start' }
      );
    if (ovrErr) errors.push(`status override: ${ovrErr.message}`);
  } else {
    console.warn('[update-booking-status] missing slot_start — status may not persist for non-native bookings', { bookingId });
    errors.push('status override: missing slot_start');
  }

  // 1a. Update the native bookings row too, when this is a real uuid-keyed booking.
  if (isUuidBooking) {
    const { error: bookingErr } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId);
    if (bookingErr) errors.push(`booking update: ${bookingErr.message}`);
  }

  // 1b. Persist to the GHL appointment so the change survives a refresh — the
  //     meetings list reads appointmentStatus back from GHL.
  if (ghlEventId && apptStatus) {
    try {
      await updateGHLAppointmentStatus(ghlEventId, apptStatus);
    } catch (e) {
      console.error('[update-booking-status] appointment status:', e.message);
      errors.push(`GHL appointment: ${e.message}`);
    }
  }

  // 2. Update lead status (by email — most recent matching lead)
  const { data: leads } = await supabase
    .from('leads')
    .select('id, ghl_contact_id')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1);

  const lead = leads?.[0] ?? null;
  if (lead) {
    const { error: leadErr } = await supabase
      .from('leads')
      .update({ status: leadStatus, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (leadErr) errors.push(`lead update: ${leadErr.message}`);
  }

  // 3 + 4. GHL tag + opportunity stage (best-effort, non-blocking)
  try {
    // Resolve GHL contact ID — use stored one from lead or look up by email
    let ghlContactId = lead?.ghl_contact_id ?? null;
    if (!ghlContactId && process.env.GHL_API_KEY) {
      const contact = await lookupGHLContactByEmail(email);
      ghlContactId = contact?.id ?? null;
    }

    if (ghlContactId) {
      // Add tag
      await addGHLTags(ghlContactId, [tag]).catch(e =>
        errors.push(`GHL tag: ${e.message}`)
      );
    }

    // Update opportunity stage (prefer stored opportunity ID on booking)
    if (stageId && process.env.GHL_API_KEY) {
      // Try to get opportunity ID directly from the booking record
      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('ghl_opportunity_id, ghl_contact_id')
        .eq('id', bookingId)
        .single();

      let oppId = bookingRow?.ghl_opportunity_id ?? null;

      // Fall back to searching by contact
      if (!oppId) {
        const contactId = bookingRow?.ghl_contact_id ?? ghlContactId;
        if (contactId) {
          const opp = await getGHLContactOpportunity(contactId).catch(() => null);
          oppId = opp?.id ?? null;
        }
      }

      if (oppId) {
        await updateGHLOpportunityStage(oppId, stageId).catch(e =>
          errors.push(`GHL stage: ${e.message}`)
        );
      }
    }
  } catch (ghlErr) {
    errors.push(`GHL: ${ghlErr.message}`);
  }

  // Log outcome event to lead timeline
  const eventTypeMap = {
    showed:    'appointment_showed',
    'no-show': 'appointment_no_show',
    closed:    'opportunity_closed',
  };
  logLeadEvent(email, eventTypeMap[status] || status, {
    booking_id: bookingId,
    updated_by: 'dashboard',
  }).catch(() => {});

  // Trigger mapped GHL workflow for no-show (non-blocking, but log failures)
  if (status === 'no-show') {
    try {
      const { data: settingsRow } = await supabase.from('settings').select('workflow_mappings').eq('id', 1).single();
      const mapping = settingsRow?.workflow_mappings?.mark_no_show || {};

      // Resolve the GHL contact once — gives us both the contact id and the
      // rep it's assigned to. Calendly/native rows carry no GHL user id, so the
      // contact's assignedTo is how we know which rep's workflow to fire.
      const ghlContact = process.env.GHL_API_KEY
        ? await lookupGHLContactByEmail(email).catch(() => null)
        : null;

      const userId       = assigned_user_id || ghlContact?.assignedTo || null;
      const workflowId   = userId ? mapping[userId] : null;
      const ghlContactId = ghlContact?.id ?? lead?.ghl_contact_id ?? null;

      if (!userId) {
        console.warn('[update-booking-status] no-show workflow skipped: row and contact both unassigned', { email });
        errors.push('GHL workflow: no assigned GHL user (row + contact)');
      } else if (!workflowId) {
        console.warn('[update-booking-status] no-show workflow skipped: no mapping for user', userId);
        errors.push(`GHL workflow: no mapping for user ${userId}`);
      } else if (!ghlContactId) {
        console.error('[update-booking-status] no-show workflow: could not resolve GHL contact for', email);
        errors.push('GHL workflow: no contact id');
      } else {
        await triggerWorkflow(ghlContactId, workflowId);
      }
    } catch (wfErr) {
      console.error('[update-booking-status] no-show workflow:', wfErr.message);
      errors.push(`GHL workflow: ${wfErr.message}`);
    }
  }

  res.json({ ok: true, status, errors: errors.length ? errors : undefined });
}
