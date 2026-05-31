import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  lookupGHLContactByEmail,
  getGHLContactOpportunity,
  updateGHLOpportunityStage,
} from '@/lib/ghl';

// "Appointment Scheduling" pipeline → "Sent CQ Email" stage
const GHL_STAGE_SENT_CQ = '2d399cc0-7d30-400c-beb0-b4900576e7d3';

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

  const { bookingId, email } = req.body;
  if (!bookingId || !email) {
    return res.status(400).json({ error: 'Missing bookingId or email' });
  }

  const supabase = getSupabaseAdmin();
  const errors   = [];

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

  res.json({ ok: true, errors: errors.length ? errors : undefined });
}
