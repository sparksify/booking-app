export const config = { maxDuration: 300 };

const SERP_API_KEY = process.env.SERP_API_KEY;

const INDUSTRY_QUERIES = {
  'Accounting / Financial / Payroll':  ['local independent accounting firm', 'locally owned bookkeeping service'],
  'Automotive':                        ['local independent auto repair shop', 'locally owned mechanic'],
  'Child Education / Development':      ['local independent childcare center', 'locally owned kids learning center'],
  'Cleaning / Maintenance':            ['local independent commercial cleaning service', 'locally owned janitorial service'],
  'Coffee':                            ['local independent coffee shop', 'locally owned coffee roaster'],
  'Education':                         ['local independent tutoring center', 'locally owned test prep center'],
  'Entertainment / Recreation':        ['local independent family entertainment center', 'locally owned entertainment venue'],
  'Financial Services':                ['local independent financial advisor', 'locally owned financial planning firm'],
  'Fitness':                           ['local independent fitness studio', 'locally owned gym'],
  'Food / Beverage':                   ['local independent bakery', 'locally owned juice bar'],
  'Frozen Desserts':                   ['local independent ice cream shop', 'locally owned frozen yogurt shop'],
  'Hair Care':                         ['local independent hair salon', 'locally owned barber shop'],
  'Health / Beauty / Nutrition':       ['local independent nutrition store', 'locally owned vitamin and supplement shop'],
  'Healthcare / Senior Care':          ['local independent home care agency', 'locally owned senior care service'],
  'Home Services / Property Services': ['local independent home services company', 'locally owned general contractor'],
  'Industrial':                        ['local independent industrial supply company', 'locally owned machine shop'],
  'Mailing / Shipping':                ['local independent pack and ship store', 'locally owned shipping and postal service'],
  'Medical':                           ['local independent medical clinic', 'locally owned physical therapy clinic'],
  'Moving / Storage':                  ['local independent moving company', 'locally owned self storage facility'],
  'Personal Services / Beauty':        ['local independent nail salon', 'locally owned beauty salon'],
  'Pest Control':                      ['local independent pest control service', 'locally owned exterminator'],
  'Pet Services / Pet Care':           ['local independent pet grooming', 'locally owned dog daycare'],
  'Print / Copy / Signage':            ['local independent print shop', 'locally owned sign company'],
  'Property Management':               ['local independent property management company', 'locally owned property manager'],
  'Real Estate':                       ['local independent real estate agency', 'locally owned real estate brokerage'],
  'Recycle / Reuse / Green':           ['local independent recycling center', 'locally owned junk removal service'],
  'Repair / Restoration':              ['local independent water damage restoration', 'locally owned electronics repair shop'],
  'Restaurant':                        ['local independent restaurant', 'locally owned diner'],
  'Retail':                            ['local independent boutique', 'locally owned specialty retail store'],
  'Security':                          ['local independent security company', 'locally owned alarm system company'],
  'Sports / Recreation':               ['local independent sports facility', 'locally owned recreation center'],
  'Staffing / Recruiting':             ['local independent staffing agency', 'locally owned recruiting agency'],
  'Wellness / Spa / Dayspa':           ['local independent day spa', 'locally owned wellness center'],
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
