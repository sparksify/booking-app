export const config = { maxDuration: 300 };

import { requirePipelineAccess } from '@/lib/scout/auth';

const SERP_API_KEY = process.env.SERP_API_KEY;

const INDUSTRY_QUERIES = {
  'Food & Beverage':        ['local independent restaurant', 'locally owned cafe'],
  'Health & Wellness':      ['local independent med spa', 'locally owned wellness center'],
  'Fitness':                ['local independent fitness studio', 'locally owned gym'],
  'Beauty & Personal Care': ['local independent salon', 'locally owned spa'],
  'Pet Services':           ['local independent dog grooming', 'locally owned pet care'],
  'Auto Services':          ['local independent auto repair', 'locally owned mechanic'],
  'Home Services':          ['local independent home services', 'locally owned contractor'],
  'Senior Care':            ['local independent senior care', 'locally owned assisted living'],
  'Cleaning Services':      ['local independent cleaning service', 'locally owned maid service'],
  "Children's Education":   ['local independent kids tutoring', 'locally owned learning center'],
  'Real Estate Services':   ['local independent real estate', 'locally owned property management'],
  'Marketing & Media':      ['local independent marketing agency', 'locally owned creative agency'],
};

async function serpSearch(params) {
  try {
    const p = new URLSearchParams({ ...params, api_key: SERP_API_KEY });
    const r = await fetch(`https://serpapi.com/search?${p}`);
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

export async function scoutMaps({ city, industry, limit = 30 }) {
  if (!city || !industry) {
    const error = new Error('city and industry required');
    error.status = 400;
    throw error;
  }
  if (!SERP_API_KEY) {
    const error = new Error('Missing SERP_API_KEY');
    error.status = 500;
    throw error;
  }

  const cap = Math.min(30, Math.max(1, Number(limit) || 30));
  const queries = INDUSTRY_QUERIES[industry] || [`local independent ${industry}`, `locally owned ${industry}`];
  const [maps1data, maps2data] = await Promise.all([
    serpSearch({ engine: 'google_maps', q: `${queries[0]} ${city}`, type: 'search' }),
    serpSearch({ engine: 'google_maps', q: `${queries[1]} ${city}`, type: 'search' }),
  ]);

  const seen = new Set();
  const businesses = [...(maps1data?.local_results || []), ...(maps2data?.local_results || [])]
    .filter(b => {
      const key = b.title?.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, cap)
    .map(b => {
      const website = b.website || null;
      const domain = website ? (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch(e) { return null; } })() : null;
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        business_name: b.title,
        city,
        industry,
        owner_name: null,
        website,
        domain,
        rating: b.rating || null,
        review_count: b.reviews || null,
        address: b.address || null,
        phone: b.phone || null,
        place_id: b.place_id || null,
        description: b.description || null,
        franchise_score: 5,
        ownership_score: 5,
        total_score: 10,
        signals: [
          b.rating ? `${b.rating} stars` : null,
          b.reviews ? `${b.reviews} reviews` : null,
          b.type ? b.type : null,
        ].filter(Boolean),
        ownership_candidate: false,
        broker_candidate: false,
        is_emerging: false,
      };
    });

  return {
    city, industry,
    count: businesses.length,
    emerging_count: 0,
    ownership_candidates: 0,
    broker_candidates: 0,
    maps_found: businesses.length,
    businesses,
    calls: [{ finder: 'serpapi_maps', stage: 'name', credits: 2 }],
    run_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requirePipelineAccess(req, res)) return;
  try {
    const { city, industry } = req.body || {};
    return res.status(200).json(await scoutMaps({ city, industry, limit: 30 }));
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}
