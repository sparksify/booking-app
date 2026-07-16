/**
 * Facebook Marketing API (Insights) reader for the admin Ads dashboard.
 * Read-only: account-level summary + per-campaign performance, joined against
 * Canso's own leads/bookings (leads.fb_campaign_id) for "real" CPL numbers.
 *
 * Env: FB_AD_ACCOUNT_ID (numeric, no act_ prefix), FB_ADS_TOKEN (falls back to
 * FB_CAPI_TOKEN — the system-user token with ads_management works for reads).
 */
import { getSupabaseAdmin } from '@/lib/supabase';

const FB_API = 'https://graph.facebook.com/v19.0';

export function adsAccountId() {
  return (process.env.FB_AD_ACCOUNT_ID || '1094038348205398').replace(/^act_/, '');
}
export function adsToken() {
  return process.env.FB_ADS_TOKEN || process.env.FB_CAPI_TOKEN;
}

async function fbGet(path, params) {
  const qs = new URLSearchParams({ ...params, access_token: adsToken() });
  const r = await fetch(`${FB_API}/${path}?${qs}`);
  const json = await r.json();
  if (json.error) throw new Error(`FB API: ${json.error.message}`);
  return json;
}

/** Pull the lead count out of an insights `actions` array. */
function leadCount(actions) {
  if (!Array.isArray(actions)) return 0;
  const hit = actions.find(a => a.action_type === 'lead')
    || actions.find(a => a.action_type === 'onsite_conversion.lead_grouped');
  return hit ? Number(hit.value) : 0;
}

function isoDay(d) { return d.toISOString().slice(0, 10); }

/** { since, until } for the last `days` days ending today (UTC). */
export function timeRange(days, endOffsetDays = 0) {
  const end = new Date(Date.now() - endOffsetDays * 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { since: isoDay(start), until: isoDay(end) };
}

/** Account-level totals for a time range. */
export async function accountSummary(range) {
  const json = await fbGet(`act_${adsAccountId()}/insights`, {
    fields: 'spend,impressions,clicks,ctr,cpm,frequency,actions',
    time_range: JSON.stringify(range),
    level: 'account',
  });
  const row = json.data?.[0] || {};
  const spend = Number(row.spend || 0);
  const leads = leadCount(row.actions);
  return {
    spend,
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    ctr: Number(row.ctr || 0),
    cpm: Number(row.cpm || 0),
    frequency: Number(row.frequency || 0),
    leads,
    cpl: leads ? spend / leads : null,
  };
}

/** Daily spend/leads series for sparklines. */
export async function dailySeries(range) {
  const json = await fbGet(`act_${adsAccountId()}/insights`, {
    fields: 'spend,actions',
    time_range: JSON.stringify(range),
    time_increment: '1',
    level: 'account',
  });
  return (json.data || []).map(r => ({
    date: r.date_start,
    spend: Number(r.spend || 0),
    leads: leadCount(r.actions),
  }));
}

/** Campaigns with nested insights for a time range. Includes paused campaigns. */
export async function campaignsWithInsights(range) {
  const json = await fbGet(`act_${adsAccountId()}/campaigns`, {
    fields: [
      'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time',
      `insights.time_range(${JSON.stringify(range)}){spend,impressions,clicks,ctr,cpm,frequency,actions}`,
    ].join(','),
    limit: '100',
  });
  return (json.data || []).map(c => {
    const ins = c.insights?.data?.[0] || {};
    const spend = Number(ins.spend || 0);
    const leads = leadCount(ins.actions);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      effective_status: c.effective_status,
      objective: c.objective,
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      spend,
      impressions: Number(ins.impressions || 0),
      clicks: Number(ins.clicks || 0),
      ctr: Number(ins.ctr || 0),
      cpm: Number(ins.cpm || 0),
      frequency: Number(ins.frequency || 0),
      fb_leads: leads,
      fb_cpl: leads ? spend / leads : null,
    };
  });
}

/** Ad sets (or ads) under a campaign, for drill-down. */
export async function childrenWithInsights(campaignId, range, level = 'adsets') {
  const fields = level === 'adsets'
    ? 'id,name,status,effective_status,daily_budget'
    : 'id,name,status,effective_status,creative{thumbnail_url}';
  const json = await fbGet(`${campaignId}/${level === 'adsets' ? 'adsets' : 'ads'}`, {
    fields: `${fields},insights.time_range(${JSON.stringify(range)}){spend,impressions,clicks,ctr,cpm,frequency,actions}`,
    limit: '100',
  });
  return (json.data || []).map(x => {
    const ins = x.insights?.data?.[0] || {};
    const spend = Number(ins.spend || 0);
    const leads = leadCount(ins.actions);
    return {
      id: x.id,
      name: x.name,
      effective_status: x.effective_status,
      daily_budget: x.daily_budget ? Number(x.daily_budget) / 100 : null,
      thumbnail: x.creative?.thumbnail_url || null,
      spend,
      ctr: Number(ins.ctr || 0),
      frequency: Number(ins.frequency || 0),
      fb_leads: leads,
      fb_cpl: leads ? spend / leads : null,
    };
  });
}

/**
 * Canso-side truth: leads and bookings per fb_campaign_id since a date.
 * Returns { [campaign_id]: { leads, bookings } } plus totals.
 */
export async function cansoLeadStats(sinceIso) {
  const supabase = getSupabaseAdmin();
  const { data: leads } = await supabase
    .from('leads')
    .select('id, fb_campaign_id')
    .not('fb_campaign_id', 'is', null)
    .gte('created_at', sinceIso);

  const byCampaign = {};
  const leadIds = [];
  for (const l of leads || []) {
    leadIds.push(l.id);
    byCampaign[l.fb_campaign_id] = byCampaign[l.fb_campaign_id] || { leads: 0, bookings: 0, leadIds: [] };
    byCampaign[l.fb_campaign_id].leads++;
    byCampaign[l.fb_campaign_id].leadIds.push(l.id);
  }

  if (leadIds.length) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('lead_id')
      .in('lead_id', leadIds);
    const booked = new Set((bookings || []).map(b => b.lead_id));
    for (const stats of Object.values(byCampaign)) {
      stats.bookings = stats.leadIds.filter(id => booked.has(id)).length;
      delete stats.leadIds;
    }
  } else {
    for (const stats of Object.values(byCampaign)) delete stats.leadIds;
  }

  const totals = Object.values(byCampaign).reduce(
    (t, s) => ({ leads: t.leads + s.leads, bookings: t.bookings + s.bookings }),
    { leads: 0, bookings: 0 }
  );
  return { byCampaign, totals };
}
