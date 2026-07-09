// Always-on backlog engine — GENERATION tick.
// Driven by Vercel cron. Each run: if the engine is enabled and under its daily
// SerpAPI budget, take the next territory cell and run it through the existing
// scout → filter → discover → enrich stages, dedup globally, and bank loadable
// prospects into pipeline_prospects as backlog (loaded=false). Zero changes to
// the proven stage endpoints — this just orchestrates them.
export const config = { maxDuration: 300 };

import { getSupabaseAdmin } from '@/lib/supabase';

const baseUrl = () =>
  process.env.ENGINE_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

async function stage(path, body) {
  const r = await fetch(`${baseUrl()}/api/pipeline/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  // Optional cron auth (Vercel sends Authorization: Bearer <CRON_SECRET> when set).
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supa = getSupabaseAdmin();
  const { data: eng } = await supa.from('pipeline_engine').select('*').eq('id', 1).single();
  if (!eng || !eng.enabled) return res.status(200).json({ skipped: 'engine_disabled' });

  // Daily budget (reset at UTC midnight).
  const today = new Date().toISOString().slice(0, 10);
  let spent = eng.spent_today;
  if (eng.budget_date !== today) {
    spent = 0;
    await supa.from('pipeline_engine').update({ spent_today: 0, budget_date: today }).eq('id', 1);
  }
  if (spent >= eng.daily_budget) {
    return res.status(200).json({ skipped: 'budget_exhausted', spent, budget: eng.daily_budget });
  }

  // Pick the next cell: pending first, else a done/error cell older than resweep_days.
  let { data: cells } = await supa
    .from('pipeline_cells').select('*').eq('status', 'pending').order('created_at').limit(1);
  if (!cells?.length) {
    const resweepBefore = new Date(Date.now() - (eng.resweep_days || 30) * 86400000).toISOString();
    ({ data: cells } = await supa
      .from('pipeline_cells').select('*').in('status', ['done', 'error'])
      .lt('last_run_at', resweepBefore).order('last_run_at').limit(1));
  }
  if (!cells?.length) return res.status(200).json({ skipped: 'no_cells_ready' });

  const cell = cells[0];
  await supa.from('pipeline_cells')
    .update({ status: 'running', attempts: (cell.attempts || 0) + 1, last_run_at: new Date().toISOString() })
    .eq('id', cell.id);

  try {
    const perTick = eng.businesses_per_tick || 15;

    const scout = await stage('scout', { city: cell.city, industry: cell.industry });
    let businesses = (scout.businesses || []).slice(0, perTick);

    if (businesses.length) businesses = (await stage('filter', { businesses })).businesses || [];
    if (businesses.length) businesses = (await stage('discover', { businesses })).businesses || [];

    let enr = { results: [], hit_rate: 0 };
    if (businesses.length) enr = await stage('enrich', { businesses });
    let loadable = (enr.results || []).filter(r => r.loadable && r.email);

    // Global suppression — never bank an owner/email we've already stored.
    if (loadable.length) {
      const dd = await stage('dedup-check', { prospects: loadable });
      const dupEmails = new Set(dd.duplicate_emails || []);
      const dupOwners = new Set(dd.duplicate_owner_keys || []);
      loadable = loadable.filter(p => {
        const em = String(p.email || '').toLowerCase();
        const ok = `${String(p.owner_name || '').toLowerCase()}|${String(p.domain || '').toLowerCase()}`;
        return !dupEmails.has(em) && !dupOwners.has(ok);
      });
    }

    let banked = 0;
    if (loadable.length) {
      const { data: run } = await supa.from('pipeline_runs').insert({
        city: cell.city, industry: cell.industry,
        found: (scout.businesses || []).length,
        enriched_count: (enr.results || []).filter(r => r.enriched).length,
        enrichment_rate: enr.hit_rate || 0, loaded: 0, ownership_candidates: 0,
      }).select().single();

      const rows = loadable.map(p => ({
        run_id: run?.id || null,
        business_name: p.business_name || 'Unknown',
        city: p.city || cell.city, industry: p.industry || cell.industry,
        owner_name: p.owner_name || p.email_owner || null,
        email: String(p.email).trim().toLowerCase(),
        domain: p.domain || null, website: p.website || null,
        email_source: p.email_source || null, verification: p.verification || null,
        phone: p.phone || null,
        rating: p.rating != null ? Number(p.rating) : null,
        review_count: p.review_count != null ? parseInt(p.review_count, 10) : null,
        signals: p.signals || [],
        enriched: true, loadable: true, loaded: false, source: 'maps_sweep',
      }));
      const { error } = await supa.from('pipeline_prospects').insert(rows);
      if (!error) banked = rows.length;
    }

    const spend = 2 + businesses.length * 2; // ~scout + per-business SerpAPI estimate
    await supa.from('pipeline_cells')
      .update({ status: 'done', found: (scout.businesses || []).length, backlogged: banked })
      .eq('id', cell.id);
    await supa.from('pipeline_engine')
      .update({ spent_today: spent + spend, cells_done: (eng.cells_done || 0) + 1, last_tick_at: new Date().toISOString() })
      .eq('id', 1);

    return res.status(200).json({
      cell: `${cell.city} / ${cell.industry}`,
      found: (scout.businesses || []).length, backlogged: banked, spent: spent + spend,
    });
  } catch (err) {
    await supa.from('pipeline_cells').update({ status: 'error' }).eq('id', cell.id);
    return res.status(200).json({ cell: `${cell.city} / ${cell.industry}`, error: err.message });
  }
}
