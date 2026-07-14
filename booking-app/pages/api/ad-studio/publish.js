import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

export const config = { maxDuration: 120 };

// Publish an approved ad generation to Meta as a PAUSED lead ad.
// Env: FB_ADS_TOKEN (marketing-api token), FB_AD_ACCOUNT_ID (act_XXXX), FB_PAGE_ID.
const FB_TOKEN = process.env.FB_ADS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
const AD_ACCOUNT = process.env.FB_AD_ACCOUNT_ID; // e.g. act_1234567890
const PAGE_ID = process.env.FB_PAGE_ID;
const GRAPH = 'https://graph.facebook.com/v21.0';

async function graphPost(path, body) {
  const r = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: FB_TOKEN }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`${path}: ${d.error.error_user_msg || d.error.message}`);
  return d;
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();
  if (!FB_TOKEN || !AD_ACCOUNT || !PAGE_ID) {
    return res.status(500).json({ error: 'Missing FB_ADS_TOKEN / FB_AD_ACCOUNT_ID / FB_PAGE_ID env vars' });
  }

  const {
    generationId,
    campaignId,          // reuse an existing campaign (optional)
    adsetId,             // reuse an existing ad set (optional)
    leadFormId,          // Meta lead form id (required for lead ads)
    dailyBudgetCents,    // used only when creating a new ad set
    campaignName,
  } = req.body || {};
  if (!generationId) return res.status(400).json({ error: 'generationId required' });
  if (!leadFormId) return res.status(400).json({ error: 'leadFormId required (Meta lead form to attach)' });

  const supabase = getSupabaseAdmin();
  const { data: gen, error: genErr } = await supabase
    .from('ad_generations').select('*').eq('id', generationId).single();
  if (genErr || !gen) return res.status(404).json({ error: 'Generation not found' });
  if (!gen.image_url) return res.status(400).json({ error: 'Generate an image for this ad before publishing' });

  try {
    // 1. Campaign (create paused if not reusing)
    let campId = campaignId;
    if (!campId) {
      const camp = await graphPost(`${AD_ACCOUNT}/campaigns`, {
        name: campaignName || `Ad Studio — ${gen.style} — ${new Date().toISOString().slice(0, 10)}`,
        objective: 'OUTCOME_LEADS',
        status: 'PAUSED',
        special_ad_categories: [],
      });
      campId = camp.id;
    }

    // 2. Ad set
    let asId = adsetId;
    if (!asId) {
      const adset = await graphPost(`${AD_ACCOUNT}/adsets`, {
        name: `Ad Studio Set — ${gen.style}`,
        campaign_id: campId,
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LEAD_GENERATION',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        daily_budget: dailyBudgetCents || 5000,
        destination_type: 'ON_AD',
        promoted_object: { page_id: PAGE_ID },
        targeting: { geo_locations: { countries: ['US'] } },
      });
      asId = adset.id;
    }

    // 3. Upload image to the ad account, then build the creative
    const img = await graphPost(`${AD_ACCOUNT}/adimages`, { url: gen.image_url });
    const imageHash = Object.values(img.images || {})[0]?.hash;
    if (!imageHash) throw new Error('Image upload to Meta failed');

    const creative = await graphPost(`${AD_ACCOUNT}/adcreatives`, {
      name: `Ad Studio Creative — ${gen.style} — ${gen.headline}`,
      object_story_spec: {
        page_id: PAGE_ID,
        link_data: {
          image_hash: imageHash,
          link: 'https://fb.me/',
          message: gen.primary_text,
          name: gen.headline,
          description: gen.description,
          call_to_action: {
            type: gen.cta || 'LEARN_MORE',
            value: { lead_gen_form_id: leadFormId },
          },
        },
      },
    });

    // 4. Ad (PAUSED — reviewed/activated in Ads Manager)
    const ad = await graphPost(`${AD_ACCOUNT}/ads`, {
      name: `Ad Studio — ${gen.style} — ${gen.headline}`,
      adset_id: asId,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    });

    await supabase.from('ad_generations').update({
      status: 'published',
      fb_campaign_id: campId,
      fb_adset_id: asId,
      fb_creative_id: creative.id,
      fb_ad_id: ad.id,
      published_at: new Date().toISOString(),
    }).eq('id', generationId);

    return res.json({ ok: true, campaignId: campId, adsetId: asId, creativeId: creative.id, adId: ad.id });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
