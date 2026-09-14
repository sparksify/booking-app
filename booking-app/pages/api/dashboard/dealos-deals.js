import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { evaluateDeal } from '@/lib/dealAttention';
import { OPEN_STATUSES, daysBetween } from '@/lib/dealos';

/**
 * GET /api/dashboard/dealos-deals
 *
 * The DealOS data source. Returns every candidate with their deals, each deal
 * enriched by the deterministic Deal Attention Engine, plus an executive
 * summary for the Today page.
 *
 * Response:
 *   {
 *     clients: [ { ...nurture_client, deals: [enriched deal], touchpoints } ],
 *     queue:   [ flat prioritized action queue (open deals with attention) ],
 *     summary: { active_deals, pipeline_commission, actions_due_today,
 *                commission_at_risk, waiting_count }
 *   }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  const [{ data: clients, error: e1 }, { data: allDeals, error: e2 }, { data: allTouchpoints }, { data: allEvents }] = await Promise.all([
    supabase.from('nurture_clients').select('*'),
    supabase.from('nurture_brands').select('*').order('created_at', { ascending: true }),
    supabase.from('nurture_touchpoints').select('*').order('created_at', { ascending: false }).limit(3000),
    supabase.from('nurture_deal_events').select('*').order('scheduled_at', { ascending: true, nullsFirst: false }),
  ]);
  if (e1 || e2) return res.status(500).json({ error: (e1 || e2).message });

  const now = Date.now();
  const clientById = {};
  for (const c of clients || []) clientById[c.id] = c;

  const dealsByClient = {};
  for (const d of allDeals || []) (dealsByClient[d.nurture_client_id] ??= []).push(d);

  const tpsByClient = {};
  const tpsByDeal = {};
  for (const t of allTouchpoints || []) {
    (tpsByClient[t.nurture_client_id] ??= []).push(t);
    if (t.deal_id) (tpsByDeal[t.deal_id] ??= []).push(t);
  }

  const eventsByDeal = {};
  for (const ev of allEvents || []) (eventsByDeal[ev.deal_id] ??= []).push(ev);

  const maxTime = (...ts) => {
    const ms = ts.filter(Boolean).map(t => new Date(t).getTime()).filter(Number.isFinite);
    return ms.length ? new Date(Math.max(...ms)).toISOString() : null;
  };

  const enrichedClients = (clients || []).map(c => {
    const clientTps = tpsByClient[c.id] || [];
    // Client-level candidate touchpoints cover deals with no deal_id linkage.
    const lastClientCandidateTp = clientTps.find(t => (t.party || 'candidate') === 'candidate')?.created_at || null;

    const deals = (dealsByClient[c.id] || []).map(deal => {
      const dealTps = tpsByDeal[deal.id] || [];
      const lastCandidateContactAt = maxTime(
        deal.last_candidate_contact_at,
        c.last_contacted_at,
        lastClientCandidateTp,
        dealTps.find(t => (t.party || 'candidate') === 'candidate')?.created_at,
      );
      const lastDeveloperContactAt = maxTime(
        deal.last_developer_contact_at,
        dealTps.find(t => t.party === 'developer')?.created_at,
      );
      const events = eventsByDeal[deal.id] || [];

      // Next upcoming event: denormalized column, else earliest future scheduled event.
      const futureEv = events
        .filter(ev => ev.scheduled_at && !ev.completed_at && new Date(ev.scheduled_at).getTime() > now)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] || null;
      const next_event_type = futureEv?.event_type || deal.next_event_type || null;
      const next_event_at = futureEv?.scheduled_at ||
        (deal.next_event_at && new Date(deal.next_event_at).getTime() > now ? deal.next_event_at : null);
      const lastCompletedEv = events
        .filter(ev => ev.completed_at)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0] || null;

      const attention = evaluateDeal({
        deal: { ...deal, next_event_type, next_event_at },
        client: c,
        events,
        lastCandidateContactAt,
        lastDeveloperContactAt,
        now,
      });

      return {
        ...deal,
        events,
        next_event_type,
        next_event_at,
        last_completed_event: lastCompletedEv,
        last_candidate_contact_at: lastCandidateContactAt,
        last_developer_contact_at: lastDeveloperContactAt,
        days_since_candidate_contact: daysBetween(lastCandidateContactAt, now),
        days_since_developer_contact: daysBetween(lastDeveloperContactAt, now),
        attention,
        top_attention: attention[0] || null,
        is_open: OPEN_STATUSES.includes(deal.deal_status) && !deal.outcome && c.status === 'active',
      };
    });

    return {
      ...c,
      deals,
      brands: deals, // back-compat alias for shared components
      touchpoints: clientTps.slice(0, 20),
      days_in_process: daysBetween(c.entered_at, now) ?? 0,
    };
  });

  // Flat prioritized queue: open deals that have at least one attention item.
  const queue = [];
  for (const c of enrichedClients) {
    for (const d of c.deals) {
      if (!d.is_open || !d.top_attention) continue;
      queue.push({
        deal_id: d.id,
        client_id: c.id,
        candidate: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
        brand: d.brand_name,
        estimated_commission: d.estimated_commission,
        deal_status: d.deal_status,
        priority: d.top_attention.priority,
        jeopardy: !!d.attention.find(a => a.jeopardy),
        ...d.top_attention,
      });
    }
  }
  queue.sort((a, b) => a.priority - b.priority ||
    (Number(b.estimated_commission) || 0) - (Number(a.estimated_commission) || 0));

  const openDeals = enrichedClients.flatMap(c => c.deals.filter(d => d.is_open));
  const summary = {
    active_deals: openDeals.length,
    pipeline_commission: openDeals.reduce((s, d) => s + (Number(d.estimated_commission) || 0), 0),
    actions_due_today: queue.length,
    commission_at_risk: openDeals
      .filter(d => d.attention.some(a => a.jeopardy))
      .reduce((s, d) => s + (Number(d.estimated_commission) || 0), 0),
    waiting_count: openDeals.filter(d => d.waiting_on).length,
  };

  return res.json({ clients: enrichedClients, queue, summary });
}
