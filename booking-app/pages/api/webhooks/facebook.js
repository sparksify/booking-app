import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getLeadData, parseLeadFields, generateToken } from '@/lib/facebookLeads';
import { upsertGHLContact } from '@/lib/ghl';
import { logLeadEvent } from '@/lib/leadEvents';

/**
 * /api/webhooks/facebook
 *
 * GET  — Facebook webhook verification (hub.challenge handshake)
 * POST — New lead notification; fetches full lead data and stores it
 *
 * Required env vars:
 *   FB_WEBHOOK_VERIFY_TOKEN  — any string you choose; paste into Facebook App settings
 *   FB_APP_SECRET            — from Facebook App → Settings → Basic
 *   FB_PAGE_ACCESS_TOKEN     — long-lived Page Access Token
 *   GHL_LOCATION_ID          — GoHighLevel sub-account location ID
 *   GHL_API_KEY              — GoHighLevel private integration key
 */
export default async function handler(req, res) {
  if (req.method === 'GET')  return handleVerify(req, res);
  if (req.method === 'POST') return handleWebhook(req, res);
  res.status(405).end();
}

// ─── Verification handshake ───────────────────────────────────────────────────

function handleVerify(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_WEBHOOK_VERIFY_TOKEN) {
    console.log('[fb-webhook] verified');
    return res.status(200).send(challenge);
  }
  console.warn('[fb-webhook] verification failed', { mode, token });
  return res.status(403).json({ error: 'Forbidden' });
}

// ─── Raw body reader ─────────────────────────────────────────────────────────

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ─── Lead event handler ───────────────────────────────────────────────────────

async function handleWebhook(req, res) {
  const rawBody = await getRawBody(req);

  // Verify payload signature using the raw body bytes Facebook signed
  if (process.env.FB_APP_SECRET) {
    const sig      = req.headers['x-hub-signature-256'] || '';
    const expected = 'sha256=' + crypto
      .createHmac('sha256', process.env.FB_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    if (sig !== expected) {
      console.warn('[fb-webhook] signature mismatch');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // Acknowledge immediately — Facebook retries if we take > 20 s
  res.json({ ok: true });

  const { entry = [] } = JSON.parse(rawBody);
  const supabase = getSupabaseAdmin();

  for (const e of entry) {
    for (const change of (e.changes || [])) {
      if (change.field !== 'leadgen') continue;

      const {
        leadgen_id,
        page_id,
        form_id,
        ad_id,
        adset_id,
        campaign_id,
      } = change.value;

      try {
        // 1. Pull full lead answers from Facebook
        const fbLead = await getLeadData(leadgen_id);
        const parsed = parseLeadFields(fbLead.field_data || []);

        // 2. Store in Supabase (upsert in case of duplicate delivery)
        const token = generateToken();
        const { data: lead, error: dbErr } = await supabase
          .from('leads')
          .upsert({
            token,
            fb_lead_id:      leadgen_id,
            fb_form_id:      form_id    || null,
            fb_page_id:      page_id    || null,
            fb_ad_id:        ad_id      || null,
            fb_adset_id:     adset_id   || null,
            fb_campaign_id:  campaign_id || null,
            first_name:      parsed.firstName       || null,
            last_name:       parsed.lastName        || null,
            email:           parsed.email           || null,
            phone:           parsed.phone           || null,
            investment_level: parsed.investmentLevel || null,
            raw_fields:      parsed.raw,
            status:          'new',
            updated_at:      new Date().toISOString(),
          }, {
            onConflict:       'fb_lead_id',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (dbErr) {
          console.error('[fb-webhook] supabase error:', dbErr.message);
          continue;
        }

        console.log(`[fb-webhook] lead stored: ${lead.id} token=${lead.token}`);

        // Log lead_submitted event
        if (parsed.email) {
          logLeadEvent(parsed.email, 'lead_submitted', {
            source:      'facebook_lead_ad',
            fb_form_id:  form_id      || null,
            fb_ad_id:    ad_id        || null,
            fb_campaign_id: campaign_id || null,
            investment_level: parsed.investmentLevel || null,
          }, { leadId: lead.token }).catch(() => {});
        }

        // 3. Look up form tag rules from settings
        let formTags = ['facebook-lead'];
        if (form_id) formTags.push(`form-${form_id}`);
        try {
          const { data: settingsRow } = await supabase
            .from('settings').select('form_tag_rules').eq('id', 1).single();
          const rules = settingsRow?.form_tag_rules || [];
          const matchedRule = rules.find(r => r.form_id === form_id);
          if (matchedRule?.tags?.length) {
            formTags = [...new Set([...formTags, ...matchedRule.tags])];
          }
        } catch (e) {
          console.warn('[fb-webhook] could not load form_tag_rules:', e.message);
        }

        // 4. Sync to GoHighLevel
        if (process.env.GHL_LOCATION_ID && process.env.GHL_API_KEY) {
          try {
            const ghlContact = await upsertGHLContact({
              locationId: process.env.GHL_LOCATION_ID,
              firstName:  parsed.firstName,
              lastName:   parsed.lastName,
              email:      parsed.email,
              phone:      parsed.phone,
              tags:       formTags,
              source:     'Facebook Lead Ad',
              customFields: parsed.investmentLevel
                ? [{ key: 'investment_level', field_value: parsed.investmentLevel }]
                : [],
            });

            if (ghlContact?.id) {
              await supabase
                .from('leads')
                .update({ ghl_contact_id: ghlContact.id })
                .eq('id', lead.id);
              console.log(`[fb-webhook] GHL contact: ${ghlContact.id}`);

              if (parsed.email) {
                logLeadEvent(parsed.email, 'ghl_contact_created', {
                  ghl_contact_id: ghlContact.id,
                }, { leadId: lead.token }).catch(() => {});
              }

            }
          } catch (ghlErr) {
            console.error('[fb-webhook] GHL error:', ghlErr.message);
          }
        }

      } catch (err) {
        console.error('[fb-webhook] error processing leadgen_id', leadgen_id, err.message);
      }
    }
  }
}

// Disable Next.js body parser so we can read the raw bytes for signature verification
export const config = {
  api: { bodyParser: false },
};
