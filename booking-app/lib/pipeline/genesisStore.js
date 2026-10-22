import { sameLead } from './genesisRun.mjs';

const RETRYABLE = new Set(['Error', 'Pending', 'Enriching']);

async function rowsWhere(db, build) {
  let query = db.from('genesis_leads').select('*').limit(5);
  query = build(query);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function findExistingLead(db, lead) {
  const dry = !!lead.dry_run;
  if (lead.external_id) {
    const rows = await rowsWhere(db, query => query.eq('external_id', lead.external_id).eq('dry_run', dry));
    const hit = rows.find(row => sameLead(row, lead));
    if (hit) return hit;
  }
  if (lead.domain) {
    const rows = await rowsWhere(db, query => query.eq('dry_run', dry).ilike('domain', lead.domain));
    const hit = rows.find(row => sameLead(row, lead));
    if (hit) return hit;
  }
  if (lead.brand_key) {
    const rows = await rowsWhere(db, query => query.eq('brand_key', lead.brand_key).eq('city_key', lead.city_key || '').eq('dry_run', dry));
    const hit = rows.find(row => sameLead(row, lead));
    if (hit) return hit;
  }
  return null;
}

export function createGenesisStore(db) {
  return {
    async claim(lead) {
      const existing = await findExistingLead(db, lead);
      if (existing && !RETRYABLE.has(existing.status)) return { duplicate: true, row: existing };
      const now = new Date().toISOString();
      if (existing) {
        const { data, error } = await db.from('genesis_leads').update({
          status: 'Pending',
          stage: 'pending',
          error: null,
          updated_at: now,
        }).eq('id', existing.id).select().single();
        if (error) throw error;
        return { duplicate: false, row: data, retried: true };
      }
      const { data, error } = await db.from('genesis_leads').insert({
        external_id: lead.external_id,
        source: lead.source,
        stage: 'pending',
        status: 'Pending',
        business_name: lead.business_name,
        brand_key: lead.brand_key,
        city: lead.city,
        city_key: lead.city_key || '',
        industry: lead.industry,
        domain: lead.domain,
        website: lead.website,
        owner_name: lead.owner_name,
        phone: lead.phone,
        rating: lead.rating,
        review_count: lead.review_count,
        scout_candidate_id: lead.scout_candidate_id,
        dry_run: !!lead.dry_run,
        icebreaker_sent: false,
        credits: 0,
        calls: [],
        stage_log: [],
        created_at: now,
        updated_at: now,
      }).select().single();
      if (error?.code === '23505') {
        const again = await findExistingLead(db, lead);
        if (again) return { duplicate: true, row: again };
      }
      if (error) throw error;
      return { duplicate: false, row: data };
    },
    async update(id, patch) {
      const { data, error } = await db.from('genesis_leads').update({
        ...patch,
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
  };
}
