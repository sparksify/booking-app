import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Deal events (granular franchisor milestones) for DealOS.
 *
 * GET  ?deal_id=…                 → { events }
 * POST { deal_id, event_type, title?, scheduled_at?, completed_at?, notes? }
 *                                 → create → { event }
 * POST { id, ...fields }          → update (scheduled_at, completed_at,
 *                                   debrief_done, title, notes) → { event }
 * POST { id, delete: true }       → remove → { ok }
 *
 * After any write, the deal's denormalized next_event_type/next_event_at are
 * recomputed from the earliest future, uncompleted event.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const dealId = (req.query.deal_id || '').toString();
    if (!dealId) return res.status(400).json({ error: 'deal_id required' });
    const { data: events, error } = await supabase
      .from('nurture_deal_events')
      .select('*')
      .eq('deal_id', dealId)
      .order('scheduled_at', { ascending: true, nullsFirst: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ events: events || [] });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  let event = null;
  let dealId = body.deal_id;

  if (body.id && body.delete) {
    const { data: existing } = await supabase
      .from('nurture_deal_events').select('deal_id').eq('id', body.id).single();
    dealId = existing?.deal_id;
    const { error } = await supabase.from('nurture_deal_events').delete().eq('id', body.id);
    if (error) return res.status(500).json({ error: error.message });
  } else if (body.id) {
    const patch = {};
    for (const k of ['event_type', 'title', 'scheduled_at', 'completed_at', 'debrief_done', 'notes']) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await supabase
      .from('nurture_deal_events').update(patch).eq('id', body.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    event = data;
    dealId = data.deal_id;
  } else {
    if (!body.deal_id || !body.event_type) {
      return res.status(400).json({ error: 'deal_id and event_type required' });
    }
    const { data, error } = await supabase
      .from('nurture_deal_events')
      .insert({
        deal_id: body.deal_id,
        event_type: body.event_type,
        title: body.title || null,
        scheduled_at: body.scheduled_at || null,
        completed_at: body.completed_at || null,
        notes: body.notes || null,
        created_by: session.user.email,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    event = data;
  }

  // Recompute the deal's next upcoming event.
  if (dealId) {
    const { data: future } = await supabase
      .from('nurture_deal_events')
      .select('event_type, scheduled_at')
      .eq('deal_id', dealId)
      .is('completed_at', null)
      .gt('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1);
    const next = future?.[0] || null;
    await supabase
      .from('nurture_brands')
      .update({
        next_event_type: next?.event_type || null,
        next_event_at: next?.scheduled_at || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dealId);
  }

  return res.json(event ? { event } : { ok: true });
}
