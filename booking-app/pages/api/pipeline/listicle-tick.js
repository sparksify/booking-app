// Listicle lane — cron tick. Low cadence, high gate. Discovers media-mentioned
// businesses, keeps ONLY the ones the Maps engine hasn't already found, runs
// them through the same filter → discover → enrich, and banks the verified,
// unique leads to the backlog tagged source='listicle' (media signal preserved).
export const config = { maxDuration: 300 };

import { getSupabaseAdmin } from '@/lib/supabase';

const baseUrl = () =>
  process.env.ENGINE_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

async function stage(path, body) {
  const r = await fetch(`${baseUrl()}/api/pipeline/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supa = getSupabaseAdmin();
  const { data: eng } = await supa.from('pipeline_engine').select('*').eq('id', 1).single();
  if (!eng || !eng.enabled) return res.status(200).json({ skipped: 'engine_disabled' });

  const today = new Date().toISOString().slice(0, 10);
  let spent = eng.listicle_spent_today;
  if (eng.listicle_budget_date !== today) {
    spent = 0;
    await supa.from('pipeline_engine').update({ listicle_spent_today: 0, listicle_budget_date: today }).eq('id', 1);
  }
  if (spent >= eng.listicle_budget) {
    return res.status(200).json({ skipped: 'listicle_budget_exhausted', spent, budget: eng.listicle_budget });
  }

  // Next listicle cell (separate cursor from the Maps lane).
  let { data: cells } = await supa
    .from('pipeline_cells').select('*').eq('listicle_status', 'pending').order('created_at').limit(1);
  if (!cells?.length) {
    const resweep = new Date(Date.now() - (eng.resweep_days || 30) * 86400000).toISOString();
    ({ data: cells } = await supa
      .from('pipeline_cells').select('*').in('listicle_status', ['done', 'error'])
      .lt('listicle_last_run_at', resweep).order('listicle_last_run_at').limit(1));
  }
  if (!cells?.length) return res.status(200).json({ skipped: 'no_cells_ready' });

  const cell = cells[0];
  await supa.from('pipeline_cells')
    .update({ listicle_status: 'running', listicle_last_run_at: new Date().toISOString() }).eq('id', cell.id);

  try {
    const disc = await stage('discover-listicles', { metro: cell.metro, city: cell.city, industry: cell.industry });
    let businesses = disc.businesses || [];

    // UNIQUENESS: drop any domain already in the backlog (from Maps or a prior listicle run).
    if (businesses.length) {
      const domains = [...new Set(businesses.map(b => (b.domain || '').toLowerCase()).filter(Boolean))];
      if (domains.length) {
        const { data: existing } = await supa.from('pipeline_prospects').select('domain').in('domain', domains);
        const have = new Set((existing || []).map(r => (r.domain || '').toLowerCase()));
        businesses = businesses.filter(b => b.domain && !have.has(b.domain.toLowerCase()));
      }
    }

    if (businesses.length) businesses = (await stage('filter', { businesses })).businesses || [];
    if (businesses.length) businesses = (await stage('discover', { businesses })).businesses || [];

    let enr = { results: [], hit_rate: 0 };
    if (businesses.length) enr = await stage('enrich', { businesses });
    const loadable = (enr.results || []).filter(r => r.loadable && r.email);

    let banked = 0;
    if (loadable.length) {
      const { data: run } = await supa.from('pipeline_runs').insert({
        city: cell.city, industry: cell.industry, found: disc.count || 0,
        enriched_count: (enr.results || []).filter(r => r.enriched).length,
        enrichment_rate: enr.hit_rate || 0, loaded: 0, ownership_candidates: 0,
      }).select().single();

      const rows = loadable.map(p => ({
        run_id: run?.id || null, business_name: p.business_name || 'Unknown',
        city: p.city || cell.city, industry: p.industry || cell.industry,
        owner_name: p.owner_name || p.email_owner || null,
        email: String(p.email).trim().toLowerCase(), domain: p.domain || null, website: p.website || null,
        email_source: p.email_source || null, verification: p.verification || null, phone: p.phone || null,
        rating: p.rating != null ? Number(p.rating) : null,
        review_count: p.review_count != null ? parseInt(p.review_count, 10) : null,
        signals: p.signals || [],           // the media mention — becomes the outreach hook
        enriched: true, loadable: true, loaded: false, source: 'listicle',
      }));
      const { error } = await supa.from('pipeline_prospects').insert(rows);
      if (!error) banked = rows.length;
    }

    const spend = (disc.queries || 6) + (disc.count || 0); // search queries + Maps resolves
    await supa.from('pipeline_cells')
      .update({ listicle_status: 'done', listicle_found: disc.count || 0, listicle_backlogged: banked }).eq('id', cell.id);
    await supa.from('pipeline_engine').update({ listicle_spent_today: spent + spend }).eq('id', 1);

    return res.status(200).json({
      cell: `${cell.city} / ${cell.industry}`,
      discovered: disc.count || 0, unique_banked: banked, spent: spent + spend,
    });
  } catch (err) {
    await supa.from('pipeline_cells').update({ listicle_status: 'error' }).eq('id', cell.id);
    return res.status(200).json({ cell: `${cell.city} / ${cell.industry}`, error: err.message });
  }
}
