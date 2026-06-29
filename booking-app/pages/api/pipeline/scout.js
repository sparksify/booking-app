export const config = { maxDuration: 300 };

const SERP_API_KEY = process.env.SERP_API_KEY;

const INDUSTRY_QUERIES = {
  'Food & Beverage':        ['restaurants', 'local food'],
  'Health & Wellness':      ['wellness spa', 'med spa'],
  'Fitness':                ['fitness studio', 'gym'],
  'Beauty & Personal Care': ['salon spa', 'beauty salon'],
  'Pet Services':           ['dog grooming', 'dog training'],
  'Auto Services':          ['auto repair shop', 'car service'],
  'Home Services':          ['home services', 'contractor'],
  'Senior Care':            ['senior care', 'assisted living'],
  'Cleaning Services':      ['cleaning service', 'maid service'],
  "Children's Education":   ['kids tutoring', 'children education'],
  'Real Estate Services':   ['real estate agency', 'property management'],
  'Marketing & Media':      ['marketing agency', 'creative agency'],
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
      type: b.type,
      source: 'google_maps',
    }));
  } catch(e) { return []; }
}

async function searchGoogleNews(query) {
  try {
    const params = new URLSearchParams({
      engine: 'google',
      q: query,
      tbm: 'nws',
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
      link: n.link,
    }));
  } catch(e) { return []; }
}

async function searchGoogleOrganic(query) {
  try {
    const params = new URLSearchParams({
      engine: 'google',
      q: query,
      num: 10,
      api_key: SERP_API_KEY,
    });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    const d = await r.json();
    return (d.organic_results || []).map(r => ({
      title: r.title,
      snippet: r.snippet,
      link: r.link,
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
    const queries = INDUSTRY_QUERIES[industry] || [industry.toLowerCase()];
    const cityState = city;

    // Run all searches in parallel
    const [maps1, maps2, newsResults, editorialResults] = await Promise.all([
      searchGoogleMaps(queries[0], cityState),
      searchGoogleMaps(queries[1] || queries[0], cityState),
      searchGoogleNews(`best new ${industry} ${cityState} 2025 owner founded`),
      searchGoogleOrganic(`best independent ${industry} ${cityState} owner founder 2024 OR 2025`),
    ]);

    // Dedupe businesses by name
    const seen = new Set();
    const allBusinesses = [...maps1, ...maps2].filter(b => {
      if (seen.has(b.name?.toLowerCase())) return false;
      seen.add(b.name?.toLowerCase());
      return true;
    }).slice(0, 25);

    const mapsData = allBusinesses.map(b =>
      `- ${b.name}: ${b.rating || 'no rating'} stars, ${b.reviews || 0} reviews, website: ${b.website || 'none'}, address: ${b.address || ''}`
    ).join('\n');

    const newsData = newsResults.slice(0, 8).map(n =>
      `- ${n.title} (${n.source}, ${n.date}): ${n.snippet}`
    ).join('\n');

    const editorialData = editorialResults.slice(0, 5).map(r =>
      `- ${r.title}: ${r.snippet}`
    ).join('\n');

    // Score using real data only
    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{
          name: 'submit_businesses',
          description: 'Submit scored franchise-ready businesses based only on real data provided.',
          input_schema: {
            type: 'object',
            properties: {
              businesses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    business_name:     { type: 'string' },
                    owner_name:        { type: 'string', description: 'Owner name only if found in news/editorial data. Null if not found.' },
                    website:           { type: 'string' },
                    domain:            { type: 'string' },
                    years_in_business: { type: 'number' },
                    num_locations:     { type: 'number' },
                    rating:            { type: 'number' },
                    review_count:      { type: 'number' },
                    franchise_score:   { type: 'number' },
                    ownership_score:   { type: 'number' },
                    total_score:       { type: 'number' },
                    signals:           { type: 'array', items: { type: 'string' }, description: 'ONLY real facts from the data. Quote actual numbers and sources.' },
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
        messages: [{ role: 'user', content: `You are a franchise development analyst scoring real businesses for franchise potential.

GOOGLE MAPS RESULTS — ${industry} in ${city}:
${mapsData || 'No Maps results found'}

NEWS COVERAGE — emerging brands and press mentions:
${newsData || 'No news results found'}

EDITORIAL COVERAGE — best-of lists and founder stories:
${editorialData || 'No editorial results found'}

Score ONLY the businesses that appear in the data above. Do not invent businesses.

franchise_score (0-10):
+3 evidence of multiple locations in same city
+2 evidence of 4+ years in business
+2 high review count with strong rating (use ACTUAL numbers: e.g. "4.7 stars, 847 reviews")
+2 systemized team signals (hiring posts, manager titles)
+1 press coverage found above
+1 strong social or brand presence

ownership_score (0-10):
+3 unique concept with no clear national franchise competitor
+2 strong brand identity or cult following
+2 scalable model, favorable category economics
+2 owner identified and shows growth ambition (from news/editorial)
+1 hot franchise category
BONUS +2 if under 3 years old with strong press buzz

total_score = franchise_score + ownership_score

IMPORTANT for signals: Write real facts only. Examples of good signals:
"4.8 stars with 1,247 Google reviews"
"Featured in Dallas Morning News 2025 Best New Restaurants"
"Founder [name] quoted discussing expansion plans"
"3 Dallas locations confirmed"
BAD signals (do not use): "Strong brand identity" "4+ years in business" "Multiple locations" — these are generic, not facts.

DISQUALIFY only if: clearly already franchising, corporate chain, or 8+ locations across multiple states.
Do NOT disqualify young or new businesses.

Call submit_businesses now.` }],
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

    // Merge website/domain from Maps data where Claude might have missed it
    const mapsMap = {};
    allBusinesses.forEach(b => { mapsMap[b.name?.toLowerCase()] = b; });

    let businesses = (toolUse.input?.businesses || [])
      .filter(b => !b.disqualified)
      .map(b => {
        const mapsMatch = mapsMap[b.business_name?.toLowerCase()];
        const website = b.website || mapsMatch?.website || null;
        const domain = b.domain || mapsMatch?.domain || (website ? (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch(e) { return null; } })() : null);
        const rating = b.rating || mapsMatch?.rating || null;
        const review_count = b.review_count || mapsMatch?.reviews || null;
        const yearsOld = b.years_in_business || 5;
        return {
          ...b,
          city,
          industry,
          website,
          domain,
          rating,
          review_count,
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
