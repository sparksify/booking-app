import { getSupabaseAdmin } from '@/lib/supabase';
import { scoutMaps } from '@/pages/api/pipeline/scout';
import { checkOne as filterOne } from '@/pages/api/pipeline/filter';
import { discoverOne } from '@/pages/api/pipeline/discover';
import { enrichOne } from '@/pages/api/pipeline/enrich';
import { draftIcebreaker } from '@/lib/pipeline/icebreaker';
import { createGenesisStore } from '@/lib/pipeline/genesisStore';
import { dryRunDependencies, runGenesis } from '@/lib/pipeline/genesisRun.mjs';
import { uuidOrNull } from '@/lib/pipeline/ownerNames.mjs';
import { logFranchiseOverride, saveFranchiseBrand } from '@/lib/pipeline/franchiseStore';

function liveDependencies(db) {
  return {
    store: createGenesisStore(db),
    dryRun: false,
    scoutMaps,
    filterOne,
    discoverOne,
    enrichOne,
    draftIcebreaker: biz => draftIcebreaker(biz, { dryRun: false }),
    recordFranchise: row => saveFranchiseBrand(db, row),
    recordOverride: row => logFranchiseOverride(db, row),
  };
}

async function mirrorProspects(db, out) {
  const fresh = (out.leads || []).filter(lead => !lead.deduped && lead.business_name && lead.status !== 'Error' && lead.hold_reason !== 'franchise');
  if (!fresh.length) return;
  const city = fresh.find(lead => lead.city)?.city || out.city || 'Genesis';
  const industry = fresh.find(lead => lead.industry)?.industry || out.industry || 'Unknown';
  const enriched = fresh.filter(lead => lead.status === 'Enriched').length;
  const { data: run, error } = await db.from('pipeline_runs').insert({
    city,
    industry,
    found: fresh.length,
    enriched_count: enriched,
    enrichment_rate: Math.round((enriched / fresh.length) * 100),
    loaded: 0,
    ownership_candidates: fresh.filter(lead => lead.owner_name).length,
  }).select().single();
  if (error) throw error;
  const rows = fresh.map(lead => ({
    run_id: run.id,
    business_name: lead.business_name,
    city: lead.city,
    industry: lead.industry,
    owner_name: lead.owner_name,
    email: lead.email ? String(lead.email).toLowerCase() : null,
    domain: lead.domain,
    website: lead.website,
    email_source: lead.email_source,
    verification: lead.verification,
    phone: lead.phone || null,
    rating: lead.rating != null ? Number(lead.rating) : null,
    review_count: lead.review_count != null ? parseInt(lead.review_count, 10) : null,
    signals: [lead.signal].filter(Boolean),
    enriched: lead.status === 'Enriched',
    loaded: false,
    smartlead_status: 'draft_only',
    source_type: lead.source || out.source || 'genesis',
    scout_candidate_id: uuidOrNull(lead.scout_candidate_id),
  }));
  const { data: saved, error: insertError } = await db.from('pipeline_prospects').insert(rows).select('id, business_name, domain, scout_candidate_id');
  if (insertError) throw insertError;
  out.pipeline_run_id = run.id;
  out.prospects = saved || [];
}

export async function executeGenesis(input, db) {
  const dry = input?.dry_run === true || input?.dryRun === true;
  if (dry) return runGenesis({ ...input, dry_run: true }, dryRunDependencies());
  const storeDb = db || getSupabaseAdmin();
  const out = await runGenesis(input, liveDependencies(storeDb));
  try {
    await mirrorProspects(storeDb, out);
  } catch (error) {
    out.mirror_error = error.message;
  }
  return out;
}
