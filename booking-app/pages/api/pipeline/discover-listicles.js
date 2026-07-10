// Listicle / media-signal discovery — the QUALITY lane.
// Instead of Google Maps, it runs "best of / top 10 / up-and-coming" SEARCHES
// (plus niche publications like Eater and each metro's "Best Of" magazine),
// has Claude pull out the named businesses + WHY they were mentioned (the media
// signal = the outreach hook), then resolves each to a website via Maps.
// Returns businesses shaped like scout output, tagged source='listicle'.
export const config = { maxDuration: 300 };

const SERP_API_KEY   = process.env.SERP_API_KEY;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;

// Each metro's local "Best Of" publications.
const METRO_MAGS = {
  dfw:          ['D Magazine "Best of Big D"', 'Dallas Observer "Best of Dallas"'],
  austin:       ['Austin Monthly "Best of Austin"', 'Austin Chronicle "Best of Austin"'],
  houston:      ['Houstonia "Best of Houston"', 'CultureMap Houston best'],
  san_antonio:  ['San Antonio Magazine "Best of San Antonio"', 'San Antonio Current "Best of SA"'],
};

// Clean search term per niche (the 33 franchise categories → natural list phrasing).
const NICHE_TERMS = {
  'Accounting / Financial / Payroll': 'accounting firms', 'Automotive': 'auto repair shops',
  'Child Education / Development': 'childcare and learning centers', 'Cleaning / Maintenance': 'cleaning services',
  'Coffee': 'coffee shops', 'Education': 'tutoring centers', 'Entertainment / Recreation': 'entertainment venues',
  'Financial Services': 'financial advisors', 'Fitness': 'gyms and fitness studios', 'Food / Beverage': 'restaurants',
  'Frozen Desserts': 'ice cream shops', 'Hair Care': 'hair salons', 'Health / Beauty / Nutrition': 'nutrition shops',
  'Healthcare / Senior Care': 'senior care providers', 'Home Services / Property Services': 'home service companies',
  'Industrial': 'industrial suppliers', 'Mailing / Shipping': 'shipping stores', 'Medical': 'medical clinics',
  'Moving / Storage': 'moving companies', 'Personal Services / Beauty': 'beauty salons', 'Pest Control': 'pest control companies',
  'Pet Services / Pet Care': 'pet groomers', 'Print / Copy / Signage': 'print and sign shops',
  'Property Management': 'property management companies', 'Real Estate': 'real estate agencies',
  'Recycle / Reuse / Green': 'junk removal companies', 'Repair / Restoration': 'restoration companies',
  'Restaurant': 'restaurants', 'Retail': 'boutiques', 'Security': 'security companies',
  'Sports / Recreation': 'sports and recreation facilities', 'Staffing / Recruiting': 'staffing agencies',
  'Wellness / Spa / Dayspa': 'day spas',
};

// Niche-specific authoritative publications (site: or name). Others fall back to
// the generic "best of" queries + the metro magazines.
const NICHE_SOURCES = {
  'Food / Beverage': ['site:eater.com', 'The Infatuation', 'Thrillist'],
  'Restaurant':      ['site:eater.com', 'The Infatuation', 'Thrillist'],
  'Coffee':          ['site:eater.com', 'Sprudge'],
  'Frozen Desserts': ['site:eater.com'],
  'Medical':         ['Top Doctors', 'Castle Connolly'],
  'Healthcare / Senior Care': ['Top Doctors'],
  'Home Services / Property Services': ['Nextdoor Neighborhood Favorite', 'site:angi.com'],
  'Repair / Restoration':     ['Nextdoor Neighborhood Favorite'],
  'Cleaning / Maintenance':   ['Nextdoor Neighborhood Favorite'],
  'Pest Control':             ['Nextdoor Neighborhood Favorite'],
  'Wellness / Spa / Dayspa':  ['site:wellandgood.com'],
};

function buildQueries(metro, city, niche) {
  const term = NICHE_TERMS[niche] || niche.toLowerCase();
  const year = new Date().getFullYear();
  const q = [
    `best ${term} in ${city}`,
    `up and coming ${term} ${city} ${year}`,
    `award winning ${term} ${city}`,
  ];
  (METRO_MAGS[metro] || []).forEach(m => q.push(`${m} ${term}`));
  (NICHE_SOURCES[niche] || []).forEach(s => q.push(`${s} ${city} best ${term}`));
  return q.slice(0, 8);
}

function extractAiOverviewText(ai) {
  if (!ai?.text_blocks) return '';
  const lines = [];
  for (const b of ai.text_blocks) {
    if (b.snippet) lines.push(b.snippet);
    if (b.list) for (const it of b.list) { if (it.title) lines.push(it.title); if (it.snippet) lines.push(it.snippet); }
  }
  return lines.join('\n');
}
async function fetchAiOverviewPageToken(pageToken) {
  if (!pageToken || !SERP_API_KEY) return '';
  try {
    const p = new URLSearchParams({ engine: 'google_ai_overview', page_token: pageToken, api_key: SERP_API_KEY });
    const r = await fetch(`https://serpapi.com/search?${p}`);
    if (!r.ok) return '';
    return extractAiOverviewText((await r.json()).ai_overview);
  } catch (e) { return ''; }
}
async function serpText(query) {
  if (!SERP_API_KEY) return '';
  try {
    const p = new URLSearchParams({ engine: 'google', q: query, num: '10', api_key: SERP_API_KEY });
    const r = await fetch(`https://serpapi.com/search?${p}`);
    if (!r.ok) return '';
    const data = await r.json();
    const out = [];
    if (data.ai_overview) {
      const t = extractAiOverviewText(data.ai_overview);
      if (t) out.push(t);
      else if (data.ai_overview.page_token) { const f = await fetchAiOverviewPageToken(data.ai_overview.page_token); if (f) out.push(f); }
    }
    if (data.answer_box?.snippet) out.push(data.answer_box.snippet);
    (data.organic_results || []).forEach(o => { if (o.title) out.push(o.title); if (o.snippet) out.push(o.snippet); });
    (data.related_questions || []).forEach(q => { if (q.snippet) out.push(q.snippet); });
    return out.length ? `[Query: ${query}]\n${out.join('\n')}` : '';
  } catch (e) { return ''; }
}

async function extractBusinesses(city, niche, text) {
  if (!text.trim() || !ANTHROPIC_KEY) return [];
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: `From these "best of / top 10" search results about ${niche} in ${city}, extract the specific local businesses that were named or recommended, and WHY (the accolade / media mention).

Rules:
- Only real, specific, independent local businesses in or near ${city}. Skip national chains, generic advice, aggregator sites, and non-business entries.
- The "signal" must be a concrete media mention/accolade phrased so it could be used verbatim in an outreach email, and it MUST name the source publication/list when identifiable — e.g. "Named one of Austin's best new coffee shops by Eater Austin (2025)" or "Featured on D Magazine's Best of Big D list".
- Max 15 businesses.

Return ONLY a JSON array, no markdown:
[{"name":"Business Name","signal":"why they were mentioned + source"}]

Search results:
${text}` }],
      }),
    });
    const d = await r.json();
    let t = (d.content?.[0]?.text?.trim() || '[]').replace(/```json|```/g, '').trim();
    const arr = JSON.parse(t);
    return Array.isArray(arr) ? arr.filter(x => x && x.name) : [];
  } catch (e) { return []; }
}

async function resolveWebsite(name, city) {
  try {
    const p = new URLSearchParams({ engine: 'google_maps', q: `${name} ${city}`, type: 'search', api_key: SERP_API_KEY });
    const r = await fetch(`https://serpapi.com/search?${p}`);
    if (!r.ok) return null;
    const data = await r.json();
    const b = (data.local_results || [])[0] || data.place_results || null;
    if (!b || !b.website) return null;
    let domain = null;
    try { domain = new URL(b.website).hostname.replace(/^www\./, ''); } catch (e) { /* */ }
    return { website: b.website, domain, phone: b.phone || null, rating: b.rating || null, review_count: b.reviews || null, address: b.address || null, place_id: b.place_id || null };
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry, metro } = req.body || {};
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  if (!SERP_API_KEY) return res.status(500).json({ error: 'Missing SERP_API_KEY' });

  try {
    const queries = buildQueries(metro, city, industry);
    const blobs = await Promise.all(queries.map(serpText));
    const text = blobs.filter(Boolean).join('\n\n').slice(0, 24000);

    const extracted = await extractBusinesses(city, industry, text);
    const seen = new Set();
    const uniq = [];
    for (const e of extracted) {
      const k = (e.name || '').toLowerCase().trim();
      if (!k || seen.has(k)) continue;
      seen.add(k); uniq.push(e);
    }

    const resolved = await Promise.all(uniq.slice(0, 12).map(async e => {
      const m = await resolveWebsite(e.name, city);
      if (!m) return null;
      return {
        id: `lst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        business_name: e.name, city, industry, owner_name: null,
        website: m.website, domain: m.domain,
        rating: m.rating, review_count: m.review_count, address: m.address, phone: m.phone, place_id: m.place_id,
        signals: [e.signal].filter(Boolean),
        source: 'listicle',
      };
    }));
    const businesses = resolved.filter(Boolean);
    return res.status(200).json({ city, industry, queries: queries.length, extracted: uniq.length, count: businesses.length, businesses });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
