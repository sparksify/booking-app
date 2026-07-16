import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getRole } from '@/lib/role';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  timeRange, accountSummary, dailySeries,
  campaignsWithInsights, childrenWithInsights, cansoLeadStats,
} from '@/lib/fbAdsInsights';

/**
 * GET /api/dashboard/fb-ads?days=7
 *   → { summary, prev, series, campaigns, flags }  (admin only)
 * GET /api/dashboard/fb-ads?days=7&campaign_id=X&drill=adsets|ads
 *   → { children }  drill-down rows for one campaign
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if ((await getRole(session.user?.email)) !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }

  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  const range = timeRange(days);

  try {
    // Drill-down request for one campaign
    if (req.query.campaign_id) {
      const level = req.query.drill === 'ads' ? 'ads' : 'adsets';
      const children = await childrenWithInsights(String(req.query.campaign_id), range, level);
      return res.json({ children });
    }

    const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
    const [summary, prev, series, campaigns, canso] = await Promise.all([
      accountSummary(range),
      accountSummary(timeRange(days, days)), // previous period for deltas
      dailySeries(range),
      campaignsWithInsights(range),
      cansoLeadStats(sinceIso),
    ]);

    // Attach Canso-side lead/booking truth per campaign
    for (const c of campaigns) {
      const stats = canso.byCampaign[c.id] || { leads: 0, bookings: 0 };
      c.canso_leads = stats.leads;
      c.canso_bookings = stats.bookings;
      c.canso_cpl = stats.leads ? c.spend / stats.leads : null;
    }
    campaigns.sort((a, b) => b.spend - a.spend);

    // Unresolved rule flags
    const supabase = getSupabaseAdmin();
    const { data: flags } = await supabase
      .from('fb_ad_flags')
      .select('*')
      .eq('resolved', false)
      .order('flagged_at', { ascending: false });

    res.json({
      summary: {
        ...summary,
        canso_leads: canso.totals.leads,
        canso_bookings: canso.totals.bookings,
        canso_cpl: canso.totals.leads ? summary.spend / canso.totals.leads : null,
        cost_per_booking: canso.totals.bookings ? summary.spend / canso.totals.bookings : null,
      },
      prev,
      series,
      campaigns,
      flags: flags || [],
    });
  } catch (e) {
    console.error('fb-ads dashboard error:', e.message);
    res.status(502).json({ error: e.message });
  }
}
