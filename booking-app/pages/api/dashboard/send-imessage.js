/**
 * POST /api/dashboard/send-imessage
 *
 * Send an iMessage to a lead from the CRM.
 *
 * Body:
 *   { address: string, message: string, lead_id?: string, booking_id?: string }
 *
 * address can be a phone number (+1XXXXXXXXXX) or Apple ID email.
 * Requires an active dashboard session.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { sendMessage } from '@/lib/bluebubbles';
import { logEvent } from '@/lib/leadEvents';
import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { address, message, lead_id, booking_id } = req.body || {};
  if (!address || !message) {
    return res.status(400).json({ error: 'address and message are required' });
  }

  try {
    const result = await sendMessage(address, message.trim());

    // Log to lead_events so it shows up in the CRM timeline
    if (lead_id || booking_id) {
      const supabase = getSupabaseAdmin();
      const repEmail = session.user?.email || null;

      // Resolve lead_id from booking_id if needed
      let resolvedLeadId = lead_id || null;
      if (!resolvedLeadId && booking_id) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('lead_id')
          .eq('id', booking_id)
          .maybeSingle();
        resolvedLeadId = booking?.lead_id || null;
      }

      if (resolvedLeadId) {
        await logEvent({
          supabase,
          leadId:    resolvedLeadId,
          eventType: 'imessage_sent',
          label:     `iMessage sent by ${repEmail || 'rep'}: "${message.trim().slice(0, 60)}${message.length > 60 ? '…' : ''}"`,
          repEmail,
        });
      }
    }

    return res.json({ ok: true, result });
  } catch (err) {
    console.error('[send-imessage]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
