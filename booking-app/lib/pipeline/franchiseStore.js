import { sameFranchise } from './franchiseGate.mjs';
import { uuidOrNull } from './ownerNames.mjs';

async function findBrand(db, row) {
  if (row.domain) {
    const { data, error } = await db.from('franchise_brands').select('*').ilike('domain', row.domain).limit(5);
    if (error) throw error;
    const hit = (data || []).find(item => sameFranchise(item, row));
    if (hit) return hit;
  }
  if (row.brand_key) {
    const { data, error } = await db.from('franchise_brands').select('*').eq('brand_key', row.brand_key).limit(5);
    if (error) throw error;
    const hit = (data || []).find(item => sameFranchise(item, row));
    if (hit) return hit;
  }
  return null;
}

function storedRow(row, now) {
  return {
    brand: row.brand,
    brand_key: row.brand_key,
    domain: row.domain || null,
    city: row.city || null,
    city_key: row.city_key || '',
    evidence_url: row.evidence_url || null,
    evidence_kind: row.evidence_kind,
    evidence_detail: row.evidence_detail || null,
    confidence: row.confidence,
    source: row.source || null,
    external_id: row.external_id || null,
    scout_candidate_id: uuidOrNull(row.scout_candidate_id),
    found_at: now,
    created_at: now,
    updated_at: now,
  };
}

export async function saveFranchiseBrand(db, row) {
  const now = new Date().toISOString();
  const existing = await findBrand(db, row);
  if (existing) {
    const { data, error } = await db.from('franchise_brands').update({
      city: row.city || existing.city,
      evidence_url: row.evidence_url || existing.evidence_url,
      evidence_kind: row.evidence_kind || existing.evidence_kind,
      evidence_detail: row.evidence_detail || existing.evidence_detail,
      confidence: row.confidence || existing.confidence,
      source: row.source || existing.source,
      external_id: row.external_id || existing.external_id,
      scout_candidate_id: uuidOrNull(row.scout_candidate_id) || existing.scout_candidate_id,
      updated_at: now,
    }).eq('id', existing.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from('franchise_brands').insert(storedRow(row, now)).select().single();
  if (error?.code === '23505') {
    const again = await findBrand(db, row);
    if (again) return again;
  }
  if (error) throw error;
  return data;
}

export async function logFranchiseOverride(db, row) {
  const existing = await findBrand(db, row);
  if (!existing) return null;
  const now = new Date().toISOString();
  const { data, error } = await db.from('franchise_brands').update({
    override_reason: row.override_reason,
    overridden_at: now,
    updated_at: now,
  }).eq('id', existing.id).select().single();
  if (error) throw error;
  return data;
}
