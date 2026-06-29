import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === 'POST') {
    const { city, industry, found, enriched_count, enrichment_rate, loaded, ownership_candidates } = req.body;
    const { data, error } = await supabase
      .from('pipeline_runs')
      .insert({ city, industry, found, enriched_count, enrichment_rate, loaded, ownership_candidates })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ run_id: data.id, run: data });
  }

  if (req.method === 'GET') {
    const { type } = req.query;

    if (type === 'replies') {
      const { data, error } = await supabase
        .from('pipeline_replies')
        .select('*')
        .eq('reviewed', false)
        .order('replied_at', { ascending: false })
        .limit(50);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ replies: data || [] });
    }

    if (type === 'history') {
      const { data, error } = await supabase
        .from('pipeline_runs')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(20);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ runs: data || [] });
    }

    return res.status(400).json({ error: 'type required: replies or history' });
  }

  if (req.method === 'PATCH') {
    const { reply_id } = req.body;
    const { error } = await supabase
      .from('pipeline_replies')
      .update({ reviewed: true })
      .eq('id', reply_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
