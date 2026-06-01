import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/nurture-clients
 *
 * Returns all active nurture clients enriched with:
 *   - brands (stage, sentiment, note per franchise)
 *   - touchpoints (most recent 10)
 *   - decay status (good / warning / urgent)
 *   - days_since_contact, days_in_process
 *   - funding_needed flag (any brand at stage >= 2 and funding_intro_done = false)
 *
 * Query params:
 *   ?status=active|archived|closed  (default: active)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  const statusFilter = req.query.status || 'active';

  const [{ data: clients }, { data: allBrands }, { data: allTouchpoints }] = await Promise.all([
    supabase
      .from('nurture_clients')
      .select('*')
      .eq('status', statusFilter)
      .order('last_contacted_at', { ascending: true, nullsFirst: true }),
    supabase
      .from('nurture_brands')
      .select('*')
      .order('created_at', { ascending: true }),
    supabase
      .from('nurture_touchpoints')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const now = Date.now();

  const brandsByClient    = {};
  const touchpointsByClient = {};

  for (const b of allBrands    || []) {
    (brandsByClient[b.nurture_client_id]       ??= []).push(b);
  }
  for (const t of allTouchpoints || []) {
    (touchpointsByClient[t.nurture_client_id]  ??= []).push(t);
  }

  const enriched = (clients || []).map(c => {
    const brands     = brandsByClient[c.id]     || [];
    const touchpoints= (touchpointsByClient[c.id] || []).slice(0, 10);

    const lastContactMs = c.last_contacted_at ? new Date(c.last_contacted_at).getTime() : null;
    const daysSince     = lastContactMs ? Math.floor((now - lastContactMs) / 86400000) : null;
    const daysIn        = Math.floor((now - new Date(c.entered_at).getTime()) / 86400000);

    let decay = 'good';
    if (daysSince === null || daysSince >= 14) decay = 'urgent';
    else if (daysSince >= 7)                   decay = 'warning';

    const maxStage      = brands.length ? Math.max(...brands.map(b => b.stage)) : 1;
    const fundingNeeded = !c.funding_intro_done && maxStage >= 2;

    return {
      ...c,
      brands,
      touchpoints,
      days_since_contact: daysSince,
      days_in_process:    daysIn,
      decay,
      max_stage:          maxStage,
      funding_needed:     fundingNeeded,
    };
  }).sort((a, b) => {
    // Sort: urgent → warning → good, then by days_since_contact desc
    const rank = { urgent: 0, warning: 1, good: 2 };
    if (rank[a.decay] !== rank[b.decay]) return rank[a.decay] - rank[b.decay];
    return (b.days_since_contact ?? 999) - (a.days_since_contact ?? 999);
  });

  const stats = {
    total:           enriched.length,
    urgent:          enriched.filter(c => c.decay === 'urgent').length,
    warning:         enriched.filter(c => c.decay === 'warning').length,
    good:            enriched.filter(c => c.decay === 'good').length,
    funding_needed:  enriched.filter(c => c.funding_needed).length,
  };

  return res.json({ clients: enriched, stats });
}
