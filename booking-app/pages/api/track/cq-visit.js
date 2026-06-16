import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/track/cq-visit   (PUBLIC — called from the halloway.co/cq page)
 *
 * Body (JSON or sendBeacon text): { cid?, email?, event, slot_start?, meta? }
 *   cid:   GHL contact id (preferred — no PII in the email link). Resolved to
 *          the contact's email server-side.
 *   event: 'cq_page_viewed' (default) | 'cq_submitted'
 *
 * Logs the visit to lead_events so the CQ Recovery score can weight "viewed the
 * CQ N× but didn't submit". On 'cq_submitted' we also mark the outstanding CQ as
 * received so the lead drops out of the recovery queue.
 *
 * CORS is open to the halloway domains only.
 */

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

const ALLOWED_ORIGINS = new Set([
  'https://www.halloway.co',
  'https://halloway.co',
]);

const ALLOWED_EVENTS = new Set(['cq_page_viewed', 'cq_submitted']);

async function emailFromContactId(cid) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !cid) return null;
  try {
    const r = await fetch(`${GHL_API}/contacts/${cid}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.contact?.email || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).end();

  // sendBeacon delivers text/plain, so the body may arrive as a string.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { email, cid, event, slot_start, meta } = body || {};

  // Prefer the opaque contact id (no PII in the email link); fall back to email.
  let resolvedEmail = email || null;
  if (!resolvedEmail && cid) resolvedEmail = await emailFromContactId(cid);
  if (!resolvedEmail) return res.status(400).json({ error: 'cid or email required' });

  const cleanEmail = String(resolvedEmail).toLowerCase().trim();
  const eventType  = ALLOWED_EVENTS.has(event) ? event : 'cq_page_viewed';
  const supabase   = getSupabaseAdmin();
  const now        = new Date().toISOString();

  await supabase.from('lead_events').insert({
    email:      cleanEmail,
    event_type: eventType,
    event_data: { source: 'halloway_cq', slot_start: slot_start || null, ...(meta && typeof meta === 'object' ? meta : {}) },
  }).then(() => {});

  // A submission means the CQ is in — clear it from the recovery queue.
  if (eventType === 'cq_submitted') {
    if (slot_start) {
      await supabase.from('meeting_status_overrides').upsert(
        { email: cleanEmail, slot_start, cq_received_at: now, updated_by: 'cq_page', updated_at: now },
        { onConflict: 'email,slot_start' }
      ).then(() => {});
    } else {
      // No slot provided — mark any outstanding CQ for this email as received.
      await supabase.from('meeting_status_overrides')
        .update({ cq_received_at: now, updated_at: now })
        .eq('email', cleanEmail)
        .not('cq_sent_at', 'is', null)
        .is('cq_received_at', null)
        .then(() => {});
    }
  }

  return res.status(200).json({ ok: true });
}
