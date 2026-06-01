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

  // ── Auto-create nurture client ──────────────────────────────────────────────
  // Pull lead details to populate the nurture record
  try {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, first_name, last_name, phone, franchise_interests')
      .eq('email', email)
      .single();

    // Only create if not already in nurture queue for this email
    const { data: existing } = await supabase
      .from('nurture_clients')
      .select('id')
      .eq('email', email)
      .eq('status', 'active')
      .maybeSingle();

    if (!existing) {
      const { data: nurtureClient } = await supabase
        .from('nurture_clients')
        .insert({
          booking_id:  bookingId,
          lead_id:     lead?.id     || null,
          email,
          first_name:  lead?.first_name || null,
          last_name:   lead?.last_name  || null,
          phone:       lead?.phone      || null,
          entered_at:  now,
        })
        .select()
        .single();

      // Seed brand rows from franchise_interests
      const fi = lead?.franchise_interests || [];
      if (nurtureClient && fi.length > 0) {
        const brandRows = fi
          .filter(f => f.brand)
          .map(f => ({
            nurture_client_id: nurtureClient.id,
            brand_name:        f.brand,
            stage:             1,
          }));
        if (brandRows.length) {
          await supabase.from('nurture_brands').insert(brandRows);
        }
      }
    }
  } catch (nurtureErr) {
    errors.push(`Nurture auto-create: ${nurtureErr.message}`);
  }

  res.json({ ok: true, cq_received_at: now, errors: errors.length ? errors : undefined });
}
