import { getSupabaseAdmin } from '@/lib/supabase';
import { upsertGHLContact } from '@/lib/ghl';

/**
 * POST /api/watch/questionnaire   (public — identified by opaque lead token)
 * Body: { token, city, state, operatedBusiness, liquidCapital, netWorth }
 *
 * Saves the watch-funnel questionnaire onto the lead and pushes the answers to
 * the GHL contact as custom fields (so a future platform can build off them).
 * Fields only push to GHL when their custom-field id env var is set.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, city, state, operatedBusiness, liquidCapital, netWorth } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });

  const supabase = getSupabaseAdmin();
  const { data: lead } = await supabase
    .from('leads').select('id, email, ghl_contact_id').eq('token', token).maybeSingle();
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  const complete = !!(city && state && operatedBusiness != null && liquidCapital && netWorth);

  const patch = {
    franchise_city:   city || null,
    franchise_state:  state || null,
    operated_business: typeof operatedBusiness === 'boolean' ? operatedBusiness
                       : (operatedBusiness === 'yes' ? true : operatedBusiness === 'no' ? false : null),
    net_worth:        netWorth || null,
    investment_level: liquidCapital || null,
    updated_at:       new Date().toISOString(),
  };
  if (complete) patch.questionnaire_completed_at = new Date().toISOString();

  const { error } = await supabase.from('leads').update(patch).eq('id', lead.id);
  if (error) return res.status(500).json({ error: error.message });

  // Push to GHL as custom fields (best-effort, only fields with a configured id).
  try {
    const cf = [];
    const add = (envKey, val) => { const k = process.env[envKey]; if (k && val != null && val !== '') cf.push({ key: k, field_value: String(val) }); };
    add('GHL_FIELD_CITY', city);
    add('GHL_FIELD_STATE', state);
    add('GHL_FIELD_OPERATED_BUSINESS', patch.operated_business == null ? '' : (patch.operated_business ? 'Yes' : 'No'));
    add('GHL_FIELD_LIQUID_CAPITAL', liquidCapital);
    add('GHL_FIELD_NET_WORTH', netWorth);
    if (cf.length && lead.email && process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID) {
      await upsertGHLContact({ locationId: process.env.GHL_LOCATION_ID, email: lead.email, customFields: cf });
    }
  } catch (e) {
    console.error('[watch/questionnaire] GHL push error:', e.message);
  }

  return res.json({ ok: true, complete });
}
