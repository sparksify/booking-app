// Facebook Ads engine tick — cron-driven (see vercel.json).
// Each run: snapshot yesterday+today's per-campaign performance into
// fb_ad_snapshots, then evaluate fb_ad_rules over their rolling windows and
// upsert fb_ad_flags for breaches. The dashboard reads flags; history in
// snapshots powers trends without hitting the FB API per page load.
export const config = { maxDuration: 120 };

import { getSupabaseAdmin } from '@/lib/supabase';
import { timeRange, campaignsWithInsights, cansoLeadStats } from '@/lib/fbAdsInsights';

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supa = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // ── Snapshot today's numbers per campaign ────────────────────────────────
    const range = timeRange(1);
    const sinceIso = `${today}T00:00:00Z`;
    const [campaigns, canso] = await Promise.all([
      campaignsWithInsights(range),
      cansoLeadStats(sinceIso),
    ]);

    const rows = campaigns.map(c => ({
      snapshot_date: today,
      campaign_id: c.id,
      campaign_name: c.name,
      effective_status: c.effective_status,
      daily_budget: c.daily_budget,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.ctr,
      cpm: c.cpm,
      frequency: c.frequency,
      fb_leads: c.fb_leads,
      canso_leads: canso.byCampaign[c.id]?.leads || 0,
    }));
    if (rows.length) {
      await supa.from('fb_ad_snapshots').upsert(rows, { onConflict: 'snapshot_date,campaign_id' });
    }

    // ── Evaluate rules over rolling windows ──────────────────────────────────
    const { data: rules } = await supa.from('fb_ad_rules').select('*').eq('enabled', true);
    const flagged = [];

    for (const rule of rules || []) {
      const windowRange = timeRange(rule.window_days || 3);
      const windowCampaigns = await campaignsWithInsights(windowRange);

      for (const c of windowCampaigns) {
        if (c.effective_status !== 'ACTIVE') continue;

        let value = null;
        let breach = false;
        const th = Number(rule.threshold);

        if (rule.metric === 'cpl') {
          value = c.fb_cpl;
          breach = value != null && (rule.operator === 'lt' ? value < th : value > th);
        } else if (rule.metric === 'spend_no_leads') {
          value = c.spend;
          breach = c.fb_leads === 0 && c.spend > th;
        } else if (rule.metric === 'ctr') {
          value = c.ctr;
          breach = c.impressions > 500 && (rule.operator === 'gt' ? value > th : value < th);
        } else if (rule.metric === 'frequency') {
          value = c.frequency;
          breach = rule.operator === 'lt' ? value < th : value > th;
        } else if (rule.metric === 'spend') {
          value = c.spend;
          breach = rule.operator === 'lt' ? value < th : value > th;
        }

        if (breach) {
          flagged.push({ rule: rule.name, campaign: c.name, value });
          await supa.from('fb_ad_flags').upsert({
            rule_id: rule.id,
            campaign_id: c.id,
            campaign_name: c.name,
            detail: `${rule.name}: ${c.name} — value ${Number(value).toFixed(2)} vs threshold ${th} (last ${rule.window_days}d)`,
            value,
            threshold: th,
            severity: rule.severity,
            resolved: false,
            flagged_at: new Date().toISOString(),
          }, { onConflict: 'rule_id,campaign_id,resolved' });
        } else {
          // Auto-resolve when the campaign comes back inside the threshold
          await supa.from('fb_ad_flags')
            .update({ resolved: true })
            .eq('rule_id', rule.id).eq('campaign_id', c.id).eq('resolved', false);
        }
      }
    }

    res.json({ ok: true, snapshots: rows.length, rules: (rules || []).length, flagged });
  } catch (e) {
    console.error('fb-ads-tick error:', e.message);
    res.status(502).json({ error: e.message });
  }
}
