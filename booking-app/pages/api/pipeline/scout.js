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

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  if (!SERP_API_KEY) return res.status(500).json({ error: 'Missing SERP_API_KEY' });

  try {
    const queries = INDUSTRY_QUERIES[industry] || [`local independent ${industry}`, `locally owned ${industry}`];

    const [maps1data, maps2data] = await Promise.all([
      serpSearch({ engine: 'google_maps', q: `${queries[0]} ${city}`, type: 'search' }),
      serpSearch({ engine: 'google_maps', q: `${queries[1]} ${city}`, type: 'search' }),
    ]);

    const seen = new Set();
    const allBusinesses = [...(maps1data?.local_results || []), ...(maps2data?.local_results || [])]
      .filter(b => {
        const key = b.title?.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 30);

    if (allBusinesses.length === 0) {
      return res.status(200).json({ city, industry, count: 0, businesses: [], maps_found: 0, run_at: new Date().toISOString() });
    }

    const businessList = allBusinesses.map((b, i) =>
      `${i+1}. ${b.title} — ${b.rating || '?'} stars, ${b.reviews || 0} reviews, website: ${b.website || 'none'}`
    ).join('\n');

    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{
          name: 'submit_businesses',
          description: 'Submit all businesses with scores.',
          input_schema: {
            type: 'object',
            properties: {
              businesses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    business_name:       { type: 'string' },
                    owner_name:          { type: 'string' },
                    website:             { type: 'string' },
                    domain:              { type: 'string' },
                    franchise_score:     { type: 'number' },
                    ownership_score:     { type: 'number' },
                    total_score:         { type: 'number' },
                    signals:             { type: 'array', items: { type: 'string' } },
                    already_franchising: { type: 'boolean', description: 'True ONLY if you know for certain this business already has an active franchise program with multiple franchisees.' },
                  },
                  required: ['business_name', 'franchise_score', 'ownership_score', 'total_score', 'signals', 'already_franchising'],
                }
              }
            },
            required: ['businesses'],
          }
        }],
        tool_choice: { type: 'tool', name: 'submit_businesses' },
        messages: [{ role: 'user', content: `You are a franchise development scout. Score every business in this list for franchise potential. Include ALL of them.

${businessList}

For each business:
- franchise_score (0-10): rate based on review count, rating, number of locations, years in business
- ownership_score (0-10): rate based on how unique the concept is, brand strength, scalability
- total_score = franchise_score + ownership_score  
- signals: list 2-3 real facts from the data (e.g. "4.7 stars with 423 reviews")
- owner_name: real name only if you know it, otherwise null
- already_franchising: true ONLY if you are certain this business already sells franchises to third parties

Submit ALL ${allBusinesses.length} businesses. Do not skip any.` }],
      }),
    });

    if (!scoreRes.ok) {
      const err = await scoreRes.text();
      return res.status(500).json({ error: 'Claude error', detail: err.slice(0, 300) });
    }

    const scoreData = await scoreRes.json();
    const toolUse = (scoreData.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_businesses');
    if (!toolUse) return res.status(500).json({ error: 'No tool response', stop_reason: scoreData.stop_reason });

    const mapsMap = {};
    allBusinesses.forEach(b => { mapsMap[b.title?.toLowerCase()] = b; });

    const GENERIC = ['local owner','business owner','owner','local ownership','family','the owner','unknown','n/a'];

    let businesses = (toolUse.input?.businesses || [])
      .filter(b => !b.already_franchising)
      .map(b => {
        const maps = mapsMap[b.business_name?.toLowerCase()];
        const website = b.website || maps?.website || null;
        const domain = website ? (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch(e) { return null; } })() : null;
        return {
          ...b,
          city, industry, website, domain,
          rating: maps?.rating || null,
          review_count: maps?.reviews || null,
          owner_name: b.owner_name && !GENERIC.some(g => b.owner_name.toLowerCase().includes(g)) ? b.owner_name : null,
          ownership_candidate: (b.ownership_score || 0) >= 6,
          broker_candidate: (b.franchise_score || 0) >= 6 && (b.total_score || 0) >= 12,
          is_emerging: false,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
      })
      .sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

    return res.status(200).json({
      city, industry,
      count: businesses.length,
      emerging_count: 0,
      ownership_candidates: businesses.filter(b => b.ownership_candidate).length,
      broker_candidates: businesses.filter(b => b.broker_candidate).length,
      maps_found: allBusinesses.length,
      businesses,
      run_at: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
