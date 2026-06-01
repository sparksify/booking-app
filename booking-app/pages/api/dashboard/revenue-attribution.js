import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/revenue-attribution
 *
 * Returns:
 *   - closings: all closed deals in last 30 days, enriched with lead names
 *   - totalRevenue: sum of commissions this month
 *   - totalClosings: count of closings this month
 *   - missed: high-value leads (VIP / Speed-to-Lead / Re-Engaged) with zero call attempts
 *   - totalMissed: estimated missed commission
 *   - missedCount: total missed leads (may be more than returned in missed array)
 */

const CONV_RATES = {
  speed_to_lead: 0.35,
  vip:           0.20,
  re_engaged:    0.25,
  saves:         0.22,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  const now            = new Date();
  const days           = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo  = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sixHoursAgo   = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  // Settings for revenue per close
  const { data: settings } = await supabase.from('settings').select('revenue_per_close').single();
  const rpc = settings?.revenue_per_close || 15000;

  // Fetch closings + leads
  const { data: closings } = await supabase
    .from('closings')
    .select('*, leads(first_name, last_name, email)')
    .gte('closed_at', thirtyDaysAgo)
    .order('closed_at', { ascending: false });

  // Month totals
  const monthClosings  = (closings || []).filter(c => c.closed_at >= thisMonthStart);
  const totalRevenue   = monthClosings.reduce((s, c) => s + Number(c.commission || 0), 0);
  const totalClosings  = monthClosings.length;

  const formatted = (closings || []).map(c => ({
    id:              c.id,
    lead_id:         c.lead_id,
    lead_name:       c.leads
      ? [c.leads.first_name, c.leads.last_name].filter(Boolean).join(' ') || c.leads.email
      : 'Unknown',
    advisor_email:   c.advisor_email,
    bucket:          c.bucket,
    franchise_brand: c.franchise_brand,
    commission:      Number(c.commission),
    closed_at:       c.closed_at,
  }));

  // ── Missed revenue: high-value leads with zero call events ───────────────────
  const { data: recentLeads } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, investment_level, raw_fields, created_at, score, status')
    .gte('created_at', thirtyDaysAgo)
    .not('status', 'eq', 'closed')
    .limit(300);

  const recentLeadIds = (recentLeads || []).map(l => l.id);
  const { data: callEvents } = recentLeadIds.length
    ? await supabase
        .from('lead_events')
        .select('lead_id')
        .in('lead_id', recentLeadIds)
        .like('event_type', 'prospect_call_%')
    : { data: [] };

  const calledIds = new Set((callEvents || []).map(e => e.lead_id));

  const missedLeads = (recentLeads || [])
    .filter(l => !calledIds.has(l.id) && !['closed', 'lost', 'disqualified'].includes((l.status || '').toLowerCase()))
    .map(l => {
      const raw = l.raw_fields || {};
      const inv = Object.values(raw).join(' ') + ' ' + (l.investment_level || '');
      const isVip  = /\$500k|500,000|\$1m|1,000,000|million|250k|250,000|\$250/i.test(inv);
      const ageDays = (Date.now() - new Date(l.created_at)) / 86400000;
      const isSpeedToLead = ageDays < 0.25;
      const bucket = isVip ? 'vip' : isSpeedToLead ? 'speed_to_lead' : null;
      if (!bucket) return null;
      return {
        id:               l.id,
        lead_name:        [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email,
        bucket,
        investment_level: l.investment_level || null,
        ageDays:          Math.round(ageDays * 10) / 10,
        missedEst:        Math.round(rpc * CONV_RATES[bucket]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.missedEst - a.missedEst);

  const totalMissed = missedLeads.reduce((s, l) => s + l.missedEst, 0);

  return res.json({
    closings:      formatted,
    totalRevenue,
    totalClosings,
    missed:        missedLeads.slice(0, 10),
    missedCount:   missedLeads.length,
    totalMissed,
  });
}
