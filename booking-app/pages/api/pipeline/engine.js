// Engine control — GET status, POST to toggle on/off + tune config.
import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  const supa = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data: engine } = await supa.from('pipeline_engine').select('*').eq('id', 1).single();
    const head = { count: 'exact', head: true };
    const [{ count: cellsTotal }, { count: cellsDone }, { count: backlog }, { count: dispatched }] = await Promise.all([
      supa.from('pipeline_cells').select('*', head),
      supa.from('pipeline_cells').select('*', head).eq('status', 'done'),
      supa.from('pipeline_prospects').select('*', head).eq('loaded', false).eq('loadable', true),
      supa.from('pipeline_prospects').select('*', head).eq('smartlead_status', 'loaded'),
    ]);
    return res.status(200).json({
      engine,
      cells: { total: cellsTotal, done: cellsDone },
      backlog_ready: backlog,
      dispatched_total: dispatched,
    });
  }

  if (req.method === 'POST') {
    const allowed = ['enabled', 'daily_budget', 'businesses_per_tick', 'resweep_days', 'send_per_day', 'dispatch_batch', 'backlog_target'];
    const patch = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
    const { data, error } = await supa.from('pipeline_engine').update(patch).eq('id', 1).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ engine: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
