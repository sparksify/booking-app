export const config = { maxDuration: 300 };

const SERP_API_KEY = process.env.SERP_API_KEY;

async function searchGoogleMaps(query, location) {
  try {
    const params = new URLSearchParams({
      engine: 'google_maps',
      q: query,
      location: location,
      type: 'search',
      api_key: SERP_API_KEY,
    });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    const d = await r.json();
    return d.local_results || [];
  } catch(e) {
    console.error('Google Maps search failed:', e.message);
    return [];
  }
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
    return d.organic_results || [];
  } catch(e) {
    console.error('Google organic search failed:', e.message);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  if (!SERP_API_KEY) return res.status(500).json({ error: 'Missing SERP_API_KEY' });

  try {
    // Run both searches in parallel
    const [mapsResults, editorialResults] = await Promise.all([
      searchGoogleMaps((() => {
      const map = {
        'Food & Beverage': 'restaurants',
        'Health & Wellness': 'wellness spa med spa',
        'Fitness': 'fitness studio gym',
        'Beauty & Personal Care': 'salon spa beauty',
        'Pet Services': 'pet grooming dog training',
        'Auto Services': 'auto repair shop',
        'Home Services': 'home services contractor',
        'Senior Care': 'senior care assisted living',
        'Cleaning Services': 'cleaning service',
        "Children's Education": 'kids education tutoring',
        'Real Estate Services': 'real estate agency',
        'Marketing & Media': 'marketing agency',
      };
      return `${map[industry] || industry} ${city}`;
    })(), city),
      searchGoogleOrganic(`best new ${industry} ${city} 2025 owner founded`),
    ]);

    // Format maps results
    const mapsData = mapsResults.slice(0, 20).map(r => ({
      name: r.title,
      rating: r.rating,
      reviews: r.reviews,
      address: r.address,
      website: r.website,
      phone: r.phone,
      type: r.type,
      years_in_business: r.years_in_business || null,
      thumbnail: r.thumbnail,
    }));

    // Format editorial results
    const editorialData = editorialResults.slice(0, 10).map(r => ({
      title: r.title,
      snippet: r.snippet,
      link: r.link,
      source: r.source,
    }));

    const researchSummary = `
GOOGLE MAPS RESULTS for "${industry}" in ${city}:
${mapsData.map(b => `- ${b.name}: ${b.rating || 'no rating'} stars, ${b.reviews || 0} reviews, ${b.website || 'no website'}, ${b.address || ''}`).join('\n')}

EDITORIAL COVERAGE (emerging brands, press mentions, founder stories):
${editorialData.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}
`;

    // Claude scores based only on real data found
    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{
          name: 'submit_businesses',
          description: 'Submit the scored list of franchise-ready businesses based only on the real data provided.',
          input_schema: {
            type: 'object',
            properties: {
              businesses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    business_name:     { type: 'string' },
                    owner_name:        { type: 'string', description: 'Real owner name only if found in the data. Null if not found.' },
                    website:           { type: 'string' },
                    domain:            { type: 'string' },
                    years_in_business: { type: 'number' },
                    num_locations:     { type: 'number' },
                    rating:            { type: 'number' },
                    review_count:      { type: 'number' },
                    franchise_score:   { type: 'number' },
                    ownership_score:   { type: 'number' },
                    total_score:       { type: 'number' },
                    signals:           { type: 'array', items: { type: 'string' }, description: 'Only real signals from the data provided. Quote actual review counts, ratings, press sources.' },
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
        messages: [{ role: 'user', content: `You are a franchise development analyst. Score these real businesses found in ${city} for their franchise potential.

${researchSummary}

Score each business found in the data above. DO NOT invent businesses not in this data. DO NOT invent signals — every signal must reference actual data provided (real review counts, real ratings, real press mentions found above).

franchise_score (0-10):
+3 multiple locations in same city (only if evidence shows this)
+2 4+ years in business (only if evidence shows this)
+2 high review count with strong rating (use actual numbers from data)
+2 systemized team or hiring signals
+1 press coverage found in editorial results above
+1 active social media or strong brand presence
+1 unique concept

ownership_score (0-10):
+3 unique concept with no clear national franchise competitor
+2 strong brand identity or cult following signals
+2 scalable model (low build-out, high margin category)
+2 owner visible or expansion intent found in editorial
+1 hot franchise category right now

total_score = franchise_score + ownership_score

DISQUALIFY only if: already franchising, corporate parent, or 8+ locations across multiple states.
Do NOT disqualify for being new or young — emerging brands are high priority.

For signals, write them like: "4.7 stars with 312 Google reviews" or "Featured in Eater Dallas 2025" — real facts only.

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

    let businesses = (toolUse.input?.businesses || [])
      .filter(b => !b.disqualified)
      .map(b => {
        const yearsOld = b.years_in_business || 5;
        const isEmerging = yearsOld < 3 && (b.ownership_score || 0) >= 6;
        const isOwnership = (b.ownership_score || 0) >= 6;
        const isBroker = (b.franchise_score || 0) >= 6 && (b.total_score || 0) >= 12;
        const isEstablished = yearsOld >= 5 && (b.num_locations || 1) >= 2;
        return {
          ...b,
          city,
          industry,
          owner_name: b.owner_name && !GENERIC.some(g => b.owner_name.toLowerCase().includes(g)) ? b.owner_name : null,
          is_emerging: isEmerging,
          ownership_candidate: isOwnership,
          broker_candidate: isBroker,
          established: isEstablished,
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
      maps_found: mapsData.length,
      editorial_found: editorialData.length,
      businesses,
      run_at: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
