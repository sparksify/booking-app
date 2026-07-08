export const config = { maxDuration: 300 };

import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === 'POST') {
    const { city, industry, found, enriched_count, enrichment_rate, loaded, ownership_candidates, prospects } = req.body;
    const { data, error } = await supabase
      .from('pipeline_runs')
      .insert({ city, industry, found, enriched_count, enrichment_rate, loaded, ownership_candidates })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Persist prospects so replies can be attributed back to city / source / variant.
    let prospects_saved = 0;
    if (Array.isArray(prospects) && prospects.length > 0) {
      const rows = prospects.map(p => ({
        run_id:              data.id,
        business_name:       p.business_name || 'Unknown',
        city:                p.city || city,
        industry:            p.industry || industry,
        owner_name:          p.owner_name || p.email_owner || null,
        email:               p.email ? String(p.email).trim().toLowerCase() : null,
        domain:              p.domain || null,
        website:             p.website || null,
        email_source:        p.email_source || null,
        verification:        p.verification || null,
        phone:               p.phone || null,
        variant_labels:      p.variant_labels || null,
        rating:              p.rating != null ? Number(p.rating) : null,
        review_count:        p.review_count != null ? parseInt(p.review_count, 10) : null,
        franchise_score:     p.franchise_score || 0,
        ownership_score:     p.ownership_score || 0,
        total_score:         p.total_score || 0,
        ownership_candidate: !!p.ownership_candidate,
        signals:             p.signals || [],
        enriched:            !!p.enriched,
        loaded:              p.outreach_status === 'loaded',
        smartlead_status:    p.outreach_status || null,
      }));
      const { error: pErr } = await supabase.from('pipeline_prospects').insert(rows);
      if (pErr) console.error('prospect persist error:', pErr.message);
      else prospects_saved = rows.length;
    }

    return res.status(200).json({ run_id: data.id, run: data, prospects_saved });
  }

  if (req.method === 'GET') {
    const { type } = req.query;

    if (type === 'replies') {
      let q = supabase
        .from('pipeline_replies')
        .select('*')
        .order('replied_at', { ascending: false })
        .limit(100);
      if (req.query.all !== '1') q = q.eq('reviewed', false);
      const { data, error } = await q;
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
