import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/webhooks/pabbly
 *
 * Receives a lead from Pabbly Connect (Facebook Lead Ads → API by Pabbly).
 * GHL contact creation is handled upstream by Pabbly's LeadConnector V2 step,
 * so this endpoint only writes to the Supabase leads table.
 *
 * Auth: pass PABBLY_WEBHOOK_SECRET in the query string:
 *   POST https://your-app.vercel.app/api/webhooks/pabbly?secret=YOUR_SECRET
 *
 * Required env var:
 *   PABBLY_WEBHOOK_SECRET  — any strong random string; add to Vercel env + Pabbly URL
 *
 * Optional env var (if you want to also capture the GHL contact ID from step 2):
 *   (no extra env needed — just map ghl_contact_id in Pabbly body)
 *
 * Pabbly field mapping (in the "API by Pabbly" step, set Body to JSON):
 * {
 *   "first_name":     "{{1.field_data.0.values.0}}",   // or {{1.first_name}}
 *   "last_name":      "{{1.field_data.1.values.0}}",
 *   "email":          "{{1.email}}",
 *   "phone":          "{{1.phone_number}}",
 *   "investment_level": "{{1.liquid_capital}}",         // your form's field name
 *   "territory":      "{{1.city_state_or_territory}}",
 *   "ghl_contact_id": "{{2.contact.id}}",               // from LeadConnector V2 step
 *   "fb_lead_id":     "{{1.id}}",
 *   "fb_form_id":     "{{1.form_id}}",
 *   "fb_ad_name":     "{{1.ad_name}}"
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = req.query.secret || req.headers['x-webhook-secret'];
  if (process.env.PABBLY_WEBHOOK_SECRET && secret !== process.env.PABBLY_WEBHOOK_SECRET) {
    console.warn('[pabbly-webhook] unauthorized — bad secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  console.log('[pabbly-webhook] received:', JSON.stringify(body).slice(0, 500));

  // ── Parse name ─────────────────────────────────────────────────────────────
  let firstName = (body.first_name || '').trim();
  let lastName  = (body.last_name  || '').trim();

  // Fallback: Pabbly sometimes sends a single full_name field
  if (!firstName) {
    const full = (body.full_name || body.name || '').trim();
    if (full) {
      const parts = full.split(/\s+/);
      firstName = parts[0] || '';
      lastName  = parts.slice(1).join(' ') || '';
    }
  }

  // ── Parse other core fields ─────────────────────────────────────────────────
  const email  = (body.email || body.email_address || '').trim() || null;
  const phone  = (body.phone || body.phone_number  || body.mobile || '').trim() || null;

  // Investment level — normalize whatever the form label says
  const investmentRaw = (
    body.investment_level       ||
    body.liquid_capital         ||
    body.investable_assets      ||
    body.liquid_investment      ||
    body.net_worth              ||
    body.how_much_liquid_capital ||
    ''
  ).toString().trim();
  const investmentLevel = parseInvestmentLevel(investmentRaw);

  // ── Optional GHL contact ID (from LeadConnector V2 step 2 in Pabbly) ───────
  const ghlContactId = body.ghl_contact_id || null;

  // ── Facebook metadata (Pabbly passes these through) ─────────────────────────
  const fbLeadId   = body.fb_lead_id  || null;
  const fbFormId   = body.fb_form_id  || null;

  // ── Duplicate check by fb_lead_id (handles Pabbly retries) ─────────────────
  const supabase = getSupabaseAdmin();

  if (fbLeadId) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id, token')
      .eq('fb_lead_id', fbLeadId)
      .maybeSingle();

    if (existing) {
      console.log(`[pabbly-webhook] duplicate fb_lead_id ${fbLeadId}, returning existing`);
      // Update GHL contact ID if we now have it
      if (ghlContactId && !existing.ghl_contact_id) {
        await supabase.from('leads').update({ ghl_contact_id: ghlContactId }).eq('id', existing.id);
      }
      return res.json({ ok: true, id: existing.id, token: existing.token, duplicate: true });
    }
  }

  // ── Insert lead ─────────────────────────────────────────────────────────────
  const token = crypto.randomBytes(12).toString('hex');

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      token,
      fb_lead_id:      fbLeadId,
      fb_form_id:      fbFormId,
      first_name:      firstName   || null,
      last_name:       lastName    || null,
      email,
      phone,
      investment_level: investmentLevel || null,
      ghl_contact_id:  ghlContactId,
      raw_fields:      body,        // store full payload for debugging
      status:          'new',
      updated_at:      new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[pabbly-webhook] supabase insert error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  console.log(`[pabbly-webhook] lead stored id=${lead.id} email=${email}`);
  return res.json({ ok: true, id: lead.id, token: lead.token });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize free-text investment level answers to the app's enum values:
 *   'lt_100k' | '100k_250k' | '250k_500k' | 'gt_500k'
 */
function parseInvestmentLevel(raw) {
  if (!raw) return null;
  const r = raw.toLowerCase();

  // Greater than 500k
  if (
    r.includes('500k+') || r.includes('500,000+') ||
    r.includes('over 500') || r.includes('above 500') ||
    (r.includes('500') && !r.includes('250'))
  ) return 'gt_500k';

  // 250k–500k
  if (
    r.includes('250') && r.includes('500') ||
    r.includes('250k') || r.includes('250,000')
  ) return '250k_500k';

  // 100k–250k
  if (
    r.includes('100') && r.includes('250') ||
    r.includes('100k') || r.includes('100,000')
  ) return '100k_250k';

  // Less than 100k
  if (
    r.includes('less') || r.includes('under') ||
    r.includes('<') || r.includes('below') ||
    r.includes('50k') || r.includes('50,000') ||
    r.includes('75k') || r.includes('75,000')
  ) return 'lt_100k';

  // Can't parse — store raw string so it's not lost
  return raw;
}
