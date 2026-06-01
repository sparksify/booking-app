import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  lookupGHLContactByEmail,
  getGHLContactOpportunity,
  updateGHLOpportunityStage,
} from '@/lib/ghl';
import { logLeadEvent } from '@/lib/leadEvents';

// "Appointment Scheduling" pipeline → "CQ Received" stage
const GHL_STAGE_CQ_RECEIVED = '4bfcaef2-351b-4172-948c-740f153b84f2';

/**
 * POST /api/dashboard/mark-cq-received
 *
 * Body: { bookingId, email }
 *
 * Stamps cq_received_at on the booking, moves GHL opportunity to
 * "CQ Received" stage, and logs a cq_received lead event.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { bookingId, email } = req.body;
  if (!bookingId || !email) {
    return res.status(400).json({ error: 'Missing bookingId or email' });
  }

  const supabase = getSupabaseAdmin();
  const errors   = [];
  const now      = new Date().toISOString();

  // Stamp cq_received_at on the booking
  await supabase
    .from('bookings')
    .update({ cq_received_at: now })
    .eq('id', bookingId);

  // Look up GHL opportunity and move stage
  const { data: booking } = await supabase
    .from('bookings')
    .select('ghl_opportunity_id, ghl_contact_id')
    .eq('id', bookingId)
    .single();

  try {
    let oppId = booking?.ghl_opportunity_id ?? null;

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
      await updateGHLOpportunityStage(oppId, GHL_STAGE_CQ_RECEIVED);
    } else {
      errors.push('No GHL opportunity found for this booking');
    }
  } catch (err) {
    errors.push(err.message);
  }

  logLeadEvent(email, 'cq_received', { booking_id: bookingId }).catch(() => {});

  res.json({ ok: true, cq_received_at: now, errors: errors.length ? errors : undefined });
}
