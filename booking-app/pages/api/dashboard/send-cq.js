import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  lookupGHLContactByEmail,
  getGHLContactOpportunity,
  updateGHLOpportunityStage,
} from '@/lib/ghl';
import { logLeadEvent } from '@/lib/leadEvents';

// "Appointment Scheduling" pipeline → "Sent CQ Email" stage
const GHL_STAGE_SENT_CQ = '2d399cc0-7d30-400c-beb0-b4900576e7d3';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

async function triggerWorkflow(contactId, workflowId) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !contactId || !workflowId) return;
  await fetch(`${GHL_API}/contacts/${contactId}/workflow/${workflowId}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version':       GHL_VERSION,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ eventStartTime: '' }),
  });
}

/**
 * POST /api/dashboard/send-cq
 *
 * Body: { bookingId, email }
 *
 * Moves the GHL opportunity to "Sent CQ Email" stage.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { bookingId, email, assigned_user_id, slot_start } = req.body;
  if (!bookingId || !email) {
    return res.status(400).json({ error: 'Missing bookingId or email' });
  }

  const supabase = getSupabaseAdmin();
  const errors   = [];
  const cqSentAt = new Date().toISOString();
  const isUuidBooking = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId);

  // Look up the stored GHL opportunity ID on the booking
  const { data: booking } = await supabase
    .from('bookings')
    .select('ghl_opportunity_id, ghl_contact_id')
    .eq('id', bookingId)
    .single();

  try {
    let oppId = booking?.ghl_opportunity_id ?? null;

    // Fall back: search GHL by email if we don't have a stored ID
    if (!oppId && process.env.GHL_API_KEY) {
      let contactId = booking?.ghl_contact_id ?? null;

      if (!contactId) {
        const contact = await lookupGHLContactByEmail(email);
        contactId = contact?.id ?? null;
      }

      if (contactId) {
        const opp = await getGHLContactOpportunity(contactId);
        oppId = opp?.id ?? null;
      }
    }

    if (oppId) {
      await updateGHLOpportunityStage(oppId, GHL_STAGE_SENT_CQ);
    } else {
      errors.push('No GHL opportunity found for this booking');
    }
  } catch (err) {
    errors.push(err.message);
  }

  // Persist cq_sent_at. Native (uuid) bookings get the column updated; for all
  // sources (Calendly/GHL included) we also write a source-agnostic override
  // keyed by email + slot so the meetings list and CQ Sent KPI read it back.
  if (isUuidBooking) {
    supabase.from('bookings').update({ cq_sent_at: cqSentAt }).eq('id', bookingId).then(() => {});
  }
  if (slot_start) {
    const { error: ovrErr } = await supabase
      .from('meeting_status_overrides')
      .upsert(
        { email, slot_start, cq_sent_at: cqSentAt, updated_by: session.user?.email || 'dashboard', updated_at: cqSentAt },
        { onConflict: 'email,slot_start' }
      );
    if (ovrErr) errors.push(`cq override: ${ovrErr.message}`);
  } else {
    console.warn('[send-cq] missing slot_start — CQ sent may not persist for non-native bookings', { bookingId });
    errors.push('cq override: missing slot_start');
  }

  logLeadEvent(email, 'cq_email_sent', { booking_id: bookingId }).catch(() => {});

  // Trigger mapped GHL workflow for the assigned rep (fire-and-forget, non-blocking)
  if (assigned_user_id) {
    try {
      const { data: settingsRow } = await supabase.from('settings').select('workflow_mappings').eq('id', 1).single();
      const workflowId = settingsRow?.workflow_mappings?.send_cq?.[assigned_user_id];
      if (workflowId) {
        // Resolve GHL contact ID for the workflow call
        const { data: bookingRow } = await supabase.from('bookings').select('ghl_contact_id').eq('id', bookingId).single();
        let ghlContactId = bookingRow?.ghl_contact_id ?? null;
        if (!ghlContactId) {
          const { lookupGHLContactByEmail } = await import('@/lib/ghl');
          const c = await lookupGHLContactByEmail(email).catch(() => null);
          ghlContactId = c?.id ?? null;
        }
        if (ghlContactId) {
          triggerWorkflow(ghlContactId, workflowId).catch(() => {});
        }
      }
    } catch { /* non-fatal */ }
  }

  res.json({ ok: true, errors: errors.length ? errors : undefined });
}
