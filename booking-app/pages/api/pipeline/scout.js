export const config = { maxDuration: 300 };

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  if (!SERP_API_KEY) return res.status(500).json({ error: 'Missing SERP_API_KEY' });

  try {
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
      .slice(0, 30)
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

    return res.status(200).json({
      city, industry,
      count: businesses.length,
      emerging_count: 0,
      ownership_candidates: 0,
      broker_candidates: 0,
      maps_found: businesses.length,
      businesses,
      run_at: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
