import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getRole } from '@/lib/role';
import { getSupabaseAdmin } from '@/lib/supabase';

const METRICS = ['cpl', 'spend_no_leads', 'ctr', 'frequency', 'spend'];

/**
 * Admin-only CRUD for fb_ad_rules + resolving flags.
 *   GET    → { rules }
 *   POST   { name, metric, operator, threshold, window_days, severity } → create
 *   PUT    { id, ...fields } → update (also { flag_id, resolved: true } to resolve a flag)
 *   DELETE { id } → remove rule
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if ((await getRole(session.user?.email)) !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data } = await supabase.from('fb_ad_rules').select('*').order('created_at');
    return res.json({ rules: data || [] });
  }

  if (req.method === 'POST') {
    const { name, metric, operator = 'gt', threshold, window_days = 3, severity = 'warn' } = req.body || {};
    if (!name || !METRICS.includes(metric) || !(Number(threshold) > 0)) {
      return res.status(400).json({ error: 'name, valid metric, and positive threshold required' });
    }
    const { data, error } = await supabase
      .from('fb_ad_rules')
      .insert({ name, metric, operator, threshold: Number(threshold), window_days: Number(window_days) || 3, severity })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ rule: data });
  }

  if (req.method === 'PUT') {
    const { id, flag_id, ...fields } = req.body || {};
    if (flag_id) {
      await supabase.from('fb_ad_flags').update({ resolved: true }).eq('id', flag_id);
      return res.json({ ok: true });
    }
    if (!id) return res.status(400).json({ error: 'id required' });
    const allowed = {};
    for (const k of ['name', 'metric', 'operator', 'threshold', 'window_days', 'severity', 'enabled']) {
      if (fields[k] !== undefined) allowed[k] = fields[k];
    }
    const { data, error } = await supabase.from('fb_ad_rules').update(allowed).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ rule: data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await supabase.from('fb_ad_rules').delete().eq('id', id);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
