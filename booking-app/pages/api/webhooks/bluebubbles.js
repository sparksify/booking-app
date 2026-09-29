/**
 * POST /api/webhooks/bluebubbles
 *
 * Receives real-time events from the BlueBubbles server.
 * Configure this URL in: BlueBubbles Server → Settings → Webhooks → Add URL
 *   URL: https://your-app.vercel.app/api/webhooks/bluebubbles
 *   Events to subscribe: new-message, updated-message
 *
 * Auth: Optionally add ?secret=YOUR_SECRET to the URL and set
 *   BLUEBUBBLES_WEBHOOK_SECRET in your Vercel env vars.
 *
 * Incoming message payload shape (BlueBubbles v1):
 * {
 *   type: 'new-message',
 *   data: {
 *     guid, text, isFromMe, dateCreated,
 *     handle: { address: '+1XXXXXXXXXX' },
 *     chats: [{ guid: 'iMessage;-;+1XXXXXXXXXX' }]
 *   }
 * }
 *
 * This handler:
 *   1. Validates the optional webhook secret
 *   2. Ignores outbound messages (isFromMe = true) — those are already logged by send-imessage.js
 *   3. Looks up the lead by phone number
 *   4. Logs an imessage_received event to lead_events
 */

import { getSupabaseAdmin } from '@/lib/supabase';
import { logLeadEvent } from '@/lib/leadEvents';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Optional auth ────────────────────────────────────────────────────────────
  const secret = req.query.secret || req.headers['x-bb-secret'];
  if (process.env.BLUEBUBBLES_WEBHOOK_SECRET &&
      secret !== process.env.BLUEBUBBLES_WEBHOOK_SECRET) {
    console.warn('[bb-webhook] unauthorized — bad secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const { type, data } = body;

  console.log('[bb-webhook] event:', type, JSON.stringify(body).slice(0, 300));

  // ── Only handle inbound messages ─────────────────────────────────────────────
  if (type !== 'new-message') {
    return res.json({ ok: true, skipped: true });
  }

  if (!data || data.isFromMe) {
    return res.json({ ok: true, skipped: true });
  }

  // ── Extract phone number from the handle or chat GUID ────────────────────────
  const address =
    data.handle?.address ||
    (data.chats?.[0]?.guid || '').split(';-;')[1] ||
    null;

  if (!address) {
    console.warn('[bb-webhook] could not determine sender address');
    return res.json({ ok: true, skipped: true });
  }

  const messageText = (data.text || '').trim();

  // ── Find matching lead by phone ───────────────────────────────────────────────
  const supabase = getSupabaseAdmin();
  const normalized = normalizePhone(address);

  // Search leads table — try multiple phone formats
  const { data: leads } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, fb_lead_id')
    .or(`phone.ilike.%${normalized}%,phone.ilike.%${address}%`)
    .limit(1);

  const lead = leads?.[0] || null;

  if (lead?.email) {
    await logLeadEvent(
      lead.email,
      'imessage_received',
      {
        label: `iMessage received from ${lead.first_name || address}: "${messageText.slice(0, 80)}${messageText.length > 80 ? '…' : ''}"`,
      },
      { leadId: lead.fb_lead_id }
    );
    console.log(`[bb-webhook] logged imessage_received for lead ${lead.id}`);
  } else if (lead) {
    console.log(`[bb-webhook] lead ${lead.id} has no email — event not logged`);
  } else {
    console.log(`[bb-webhook] no lead found for address ${address} — event not logged`);
  }

  return res.json({ ok: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(str) {
  if (!str) return '';
  const digits = str.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}
