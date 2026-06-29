export const config = { maxDuration: 300 };

const SERP_API_KEY = process.env.SERP_API_KEY;

const INDUSTRY_QUERIES = {
  'Food & Beverage':        ['local independent restaurant', 'locally owned cafe coffee shop'],
  'Health & Wellness':      ['local independent med spa wellness', 'locally owned health clinic spa'],
  'Fitness':                ['local independent fitness studio gym', 'locally owned pilates yoga studio'],
  'Beauty & Personal Care': ['local independent salon spa', 'locally owned beauty boutique'],
  'Pet Services':           ['local independent dog grooming pet care', 'locally owned dog training boarding'],
  'Auto Services':          ['local independent auto repair shop', 'locally owned car service mechanic'],
  'Home Services':          ['local independent home services contractor', 'locally owned cleaning restoration'],
  'Senior Care':            ['local independent senior care', 'locally owned assisted living memory care'],
  'Cleaning Services':      ['local independent cleaning service', 'locally owned maid janitorial service'],
  "Children's Education":   ['local independent kids tutoring education', 'locally owned children learning center'],
  'Real Estate Services':   ['local independent real estate agency', 'locally owned property management'],
  'Marketing & Media':      ['local independent marketing agency', 'locally owned creative branding agency'],
};

async function searchGoogleMaps(query, city) {
  try {
    const params = new URLSearchParams({
      engine: 'google_maps',
      q: `${query} ${city}`,
      type: 'search',
      api_key: SERP_API_KEY,
    });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    const d = await r.json();
    return (d.local_results || []).map(b => ({
      name: b.title,
      rating: b.rating,
      reviews: b.reviews,
      address: b.address,
      website: b.website || null,
      domain: b.website ? (() => { try { return new URL(b.website).hostname.replace(/^www\./, ''); } catch(e) { return null; } })() : null,
      phone: b.phone,
      place_id: b.place_id,
      source: 'google_maps',
    }));
  } catch(e) { return []; }
}

async function searchGoogleNews(query) {
  try {
    const params = new URLSearchParams({
      engine: 'google_news',
      q: query,
      num: 10,
      api_key: SERP_API_KEY,
    });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    const d = await r.json();
    return (d.news_results || []).map(n => ({
      title: n.title,
      snippet: n.snippet,
      source: n.source,
      date: n.date,
    }));
  } catch(e) { return []; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  if (!SERP_API_KEY) return res.status(500).json({ error: 'Missing SERP_API_KEY' });

  try {
    const queries = INDUSTRY_QUERIES[industry] || [`local independent ${industry.toLowerCase()}`, `locally owned ${industry.toLowerCase()}`];

    const [maps1, maps2, newsResults] = await Promise.all([
      searchGoogleMaps(queries[0], city),
      searchGoogleMaps(queries[1], city),
      searchGoogleNews(`best new ${industry} ${city} 2025 owner founded independent`),
    ]);

    // Dedupe by name
    const seen = new Set();
    const allBusinesses = [...maps1, ...maps2].filter(b => {
      const key = b.name?.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 30);

    const mapsData = allBusinesses.map(b =>
      `- ${b.name}: ${b.rating || '?'} stars, ${b.reviews || 0} reviews, website: ${b.website || 'none'}`
    ).join('\n');

    const newsData = newsResults.slice(0, 8).map(n =>
      `- ${n.title} (${n.source}, ${n.date}): ${n.snippet}`
    ).join('\n');

    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{
          name: 'submit_businesses',
          description: 'Submit scored businesses. Include ALL businesses from the data — only disqualify obvious national chains or corporate-owned businesses.',
          input_schema: {
            type: 'object',
            properties: {
              businesses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    business_name:     { type: 'string' },
                    owner_name:        { type: 'string' },
                    website:           { type: 'string' },
                    domain:            { type: 'string' },
                    years_in_business: { type: 'number' },
                    num_locations:     { type: 'number' },
                    rating:            { type: 'number' },
                    review_count:      { type: 'number' },
                    franchise_score:   { type: 'number' },
                    ownership_score:   { type: 'number' },
                    total_score:       { type: 'number' },
                    signals:           { type: 'array', items: { type: 'string' } },
                    disqualified:      { type: 'boolean' },
                    disqualify_reason: { type: 'string' },
                  },
                  required: ['business_name','franchise_score','ownership_score','total_score','signals','disqualified'],
                }
              }
            },
            required: ['businesses'],
          }
        }],
        tool_choice: { type: 'tool', name: 'submit_businesses' },
        messages: [{ role: 'user', content: `Score these real local businesses in ${city} for franchise development potential.

BUSINESSES FOUND:
${mapsData}

NEWS/PRESS COVERAGE:
${newsData || 'None found'}

SCORING:
franchise_score (0-10):
+3 multiple locations in same city (evidence required)
+2 strong review count with high rating (use actual numbers)
+2 4+ years in business
+2 systemized team signals
+1 press coverage found above
+1 strong brand presence

ownership_score (0-10):
+3 truly unique concept, no national franchise competitor
+2 strong recognizable brand
+2 scalable model
+2 owner identified with growth ambition
+1 hot franchise category
+2 BONUS if under 3 years old with buzz

SIGNALS must be real facts: "4.7 stars with 623 reviews" not "strong reviews"

DISQUALIFICATION — only disqualify if CLEARLY:
- A known national chain (Applebees, Chilis, etc.)
- Corporate owned (hotel restaurant, stadium food, etc.)
- Already has franchise program

DO NOT disqualify: independent local restaurants, local concepts, anything with fewer than 8 locations, anything that might be independent even if you are unsure. When in doubt, include it.

Call submit_businesses with ALL businesses that are not obvious national chains.` }],
      }),
    });

    if (!scoreRes.ok) {
      const err = await scoreRes.text();
      return res.status(500).json({ error: 'Claude error', detail: err });
    }

    const data = await scoreRes.json();
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_businesses');
    if (!toolUse) return res.status(500).json({ error: 'No structured response', stop_reason: data.stop_reason });

    const GENERIC = ['local owner','business owner','owner','local ownership','local ownership group','family','the owner','unknown','n/a','management','staff','team'];

    const mapsMap = {};
    allBusinesses.forEach(b => { mapsMap[b.name?.toLowerCase()] = b; });

    let businesses = (toolUse.input?.businesses || [])
      .filter(b => !b.disqualified)
      .map(b => {
        const mapsMatch = mapsMap[b.business_name?.toLowerCase()];
        const website = b.website || mapsMatch?.website || null;
        const domain = b.domain || mapsMatch?.domain || (website ? (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch(e) { return null; } })() : null);
        const yearsOld = b.years_in_business || 5;
        return {
          ...b,
          city, industry, website, domain,
          rating: b.rating || mapsMatch?.rating || null,
          review_count: b.review_count || mapsMatch?.reviews || null,
          owner_name: b.owner_name && !GENERIC.some(g => b.owner_name.toLowerCase().includes(g)) ? b.owner_name : null,
          is_emerging: yearsOld < 3 && (b.ownership_score || 0) >= 6,
          ownership_candidate: (b.ownership_score || 0) >= 6,
          broker_candidate: (b.franchise_score || 0) >= 6 && (b.total_score || 0) >= 12,
          established: yearsOld >= 5 && (b.num_locations || 1) >= 2,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
      });

    businesses.sort((a, b) => {
      if (a.is_emerging && !b.is_emerging) return -1;
      if (!a.is_emerging && b.is_emerging) return 1;
      return (b.total_score || 0) - (a.total_score || 0);
    });

    return res.status(200).json({
      city, industry,
      count: businesses.length,
      emerging_count: businesses.filter(b => b.is_emerging).length,
      ownership_candidates: businesses.filter(b => b.ownership_candidate).length,
      broker_candidates: businesses.filter(b => b.broker_candidate).length,
      maps_found: allBusinesses.length,
      news_found: newsResults.length,
      businesses,
      run_at: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
