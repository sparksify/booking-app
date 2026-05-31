import { getSupabaseAdmin } from '@/lib/supabase';
import { logLeadEvent } from '@/lib/leadEvents';

/**
 * POST /api/webhooks/closebot
 *
 * Called by CloseBot when it engages (contacts) a lead.
 * Logs a `closebot_engaged` event to the lead's timeline so attribution
 * can show "Lead engaged by CloseBot → booked."
 *
 * Expected body (send at least one identifier):
 * {
 *   email?:          string   — lead's email
 *   ghl_contact_id?: string   — GHL contact ID (we'll look up their email)
 *   phone?:          string   — phone number (fallback lookup)
 *   action?:         string   — e.g. 'message_sent', 'call_initiated' (defaults to 'engaged')
 *   note?:           string   — optional freeform note from CloseBot
 *   secret?:         string   — must match CLOSEBOT_WEBHOOK_SECRET env var if set
 * }
 *
 * CloseBot integration:
 *   1. In CloseBot settings, add webhook URL: https://yourdomain.com/api/webhooks/closebot
 *   2. Set CLOSEBOT_WEBHOOK_SECRET in your Vercel env vars (optional but recommended)
 *   3. CloseBot fires this whenever it sends a message, initiates a call, etc.
 *   4. After CloseBot engagement, if the lead books, booking_source will be 'closebot'
 *      because 'closebot_engaged' will be the most recent pre-booking touchpoint.
 *
 * Booking link to use in CloseBot sequences:
 *   https://yourdomain.com/?lead=TOKEN&source=closebot
 *   (Replace TOKEN with the lead's booking token from your Supabase leads table)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Optional secret verification
  const secret = process.env.CLOSEBOT_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers['x-closebot-secret'] || req.body?.secret;
    if (provided !== secret) {
      console.warn('[closebot] secret mismatch');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { email, ghl_contact_id, phone, action = 'engaged', note } = req.body || {};

  // We need at least one identifier to look up the lead
  if (!email && !ghl_contact_id && !phone) {
    return res.status(400).json({ error: 'Provide email, ghl_contact_id, or phone' });
  }

  // Acknowledge immediately
  res.json({ ok: true });

  // Resolve email if not provided directly
  let resolvedEmail = email || null;

  if (!resolvedEmail) {
    try {
      const supabase = getSupabaseAdmin();
      let query = supabase.from('leads').select('email');

      if (ghl_contact_id) {
        query = query.eq('ghl_contact_id', ghl_contact_id);
      } else if (phone) {
        query = query.eq('phone', phone);
      }

      const { data } = await query.order('created_at', { ascending: false }).limit(1).single();
      resolvedEmail = data?.email ?? null;
    } catch (e) {
      console.warn('[closebot] could not resolve email:', e.message);
    }
  }

  if (!resolvedEmail) {
    console.warn('[closebot] no email found for payload', { ghl_contact_id, phone });
    return;
  }

  // Log the event
  await logLeadEvent(resolvedEmail, 'closebot_engaged', {
    action,
    ...(note         ? { note }          : {}),
    ...(ghl_contact_id ? { ghl_contact_id } : {}),
  });

  console.log(`[closebot] logged closebot_engaged for ${resolvedEmail} (action: ${action})`);
}
