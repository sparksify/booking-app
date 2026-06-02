/**
 * lib/normalizeLocation.js
 *
 * Normalizes a freeform "area of interest" string into structured location data.
 * Handles: zip codes, area codes, metro shorthands (DFW, ATL…), and city names.
 *
 * External calls (all free, no API key):
 *   - Zippopotamus  https://api.zippopotam.us/us/{zip}
 *   - OpenStreetMap Nominatim  https://nominatim.openstreetmap.org/search
 *
 * Returns: { raw, city, state, zip, area_code } — nulls for fields we couldn't find.
 */

// ─── Metro shorthands ─────────────────────────────────────────────────────────
const METRO = {
  DFW:  { city: 'Dallas-Fort Worth', state: 'TX' },
  ATL:  { city: 'Atlanta',           state: 'GA' },
  NYC:  { city: 'New York City',     state: 'NY' },
  LA:   { city: 'Los Angeles',       state: 'CA' },
  LAX:  { city: 'Los Angeles',       state: 'CA' },
  SF:   { city: 'San Francisco',     state: 'CA' },
  SFO:  { city: 'San Francisco Bay Area', state: 'CA' },
  CHI:  { city: 'Chicago',           state: 'IL' },
  PHX:  { city: 'Phoenix',           state: 'AZ' },
  HOU:  { city: 'Houston',           state: 'TX' },
  SAT:  { city: 'San Antonio',       state: 'TX' },
  AUS:  { city: 'Austin',            state: 'TX' },
  DC:   { city: 'Washington DC',     state: 'DC' },
  MIA:  { city: 'Miami',             state: 'FL' },
  ORL:  { city: 'Orlando',           state: 'FL' },
  TPA:  { city: 'Tampa',             state: 'FL' },
  CLT:  { city: 'Charlotte',         state: 'NC' },
  BOS:  { city: 'Boston',            state: 'MA' },
  SEA:  { city: 'Seattle',           state: 'WA' },
  PDX:  { city: 'Portland',          state: 'OR' },
  LAS:  { city: 'Las Vegas',         state: 'NV' },
  MSP:  { city: 'Minneapolis',       state: 'MN' },
  STL:  { city: 'St. Louis',         state: 'MO' },
  DEN:  { city: 'Denver',            state: 'CO' },
  PHL:  { city: 'Philadelphia',      state: 'PA' },
  DET:  { city: 'Detroit',           state: 'MI' },
  CLE:  { city: 'Cleveland',         state: 'OH' },
  CMH:  { city: 'Columbus',          state: 'OH' },
  IND:  { city: 'Indianapolis',      state: 'IN' },
  MKE:  { city: 'Milwaukee',         state: 'WI' },
  NAS:  { city: 'Nashville',         state: 'TN' },
  BNA:  { city: 'Nashville',         state: 'TN' },
  MEM:  { city: 'Memphis',           state: 'TN' },
  BHM:  { city: 'Birmingham',        state: 'AL' },
  JAX:  { city: 'Jacksonville',      state: 'FL' },
  RDU:  { city: 'Raleigh-Durham',    state: 'NC' },
  SLC:  { city: 'Salt Lake City',    state: 'UT' },
  ABQ:  { city: 'Albuquerque',       state: 'NM' },
  OKC:  { city: 'Oklahoma City',     state: 'OK' },
  TUL:  { city: 'Tulsa',             state: 'OK' },
};

// ─── Area code → region ───────────────────────────────────────────────────────
const AREA_CODE = {
  // Texas
  '214': { city: 'Dallas',             state: 'TX' },
  '469': { city: 'Dallas Metro',       state: 'TX' },
  '972': { city: 'Dallas Metro',       state: 'TX' },
  '817': { city: 'Fort Worth',         state: 'TX' },
  '682': { city: 'Fort Worth Metro',   state: 'TX' },
  '713': { city: 'Houston',            state: 'TX' },
  '281': { city: 'Houston Metro',      state: 'TX' },
  '832': { city: 'Houston Metro',      state: 'TX' },
  '346': { city: 'Houston Metro',      state: 'TX' },
  '512': { city: 'Austin',             state: 'TX' },
  '737': { city: 'Austin Metro',       state: 'TX' },
  '210': { city: 'San Antonio',        state: 'TX' },
  '726': { city: 'San Antonio',        state: 'TX' },
  '361': { city: 'Corpus Christi',     state: 'TX' },
  '956': { city: 'Rio Grande Valley',  state: 'TX' },
  '915': { city: 'El Paso',            state: 'TX' },
  '903': { city: 'East Texas (Tyler)', state: 'TX' },
  '936': { city: 'East Texas',         state: 'TX' },
  '409': { city: 'Southeast Texas',    state: 'TX' },
  '254': { city: 'Waco',               state: 'TX' },
  '325': { city: 'Abilene',            state: 'TX' },
  '432': { city: 'Midland-Odessa',     state: 'TX' },
  '806': { city: 'West Texas (Lubbock)', state: 'TX' },
  '940': { city: 'Wichita Falls',      state: 'TX' },
  '830': { city: 'Texas Hill Country', state: 'TX' },
  // California
  '213': { city: 'Los Angeles',        state: 'CA' },
  '310': { city: 'West LA / South Bay',state: 'CA' },
  '323': { city: 'Los Angeles',        state: 'CA' },
  '424': { city: 'West LA / South Bay',state: 'CA' },
  '818': { city: 'San Fernando Valley',state: 'CA' },
  '626': { city: 'Pasadena / SGV',     state: 'CA' },
  '714': { city: 'Orange County',      state: 'CA' },
  '657': { city: 'Orange County',      state: 'CA' },
  '949': { city: 'South Orange County',state: 'CA' },
  '951': { city: 'Riverside / IE',     state: 'CA' },
  '909': { city: 'San Bernardino / IE',state: 'CA' },
  '619': { city: 'San Diego',          state: 'CA' },
  '858': { city: 'North San Diego',    state: 'CA' },
  '760': { city: 'Palm Springs / N SD',state: 'CA' },
  '415': { city: 'San Francisco',      state: 'CA' },
  '628': { city: 'San Francisco',      state: 'CA' },
  '408': { city: 'Silicon Valley',     state: 'CA' },
  '669': { city: 'Silicon Valley',     state: 'CA' },
  '650': { city: 'SF Peninsula',       state: 'CA' },
  '510': { city: 'East Bay (Oakland)', state: 'CA' },
  '925': { city: 'Contra Costa Co.',   state: 'CA' },
  '916': { city: 'Sacramento',         state: 'CA' },
  '559': { city: 'Fresno',             state: 'CA' },
  '805': { city: 'Central Coast',      state: 'CA' },
  // New York
  '212': { city: 'Manhattan',          state: 'NY' },
  '646': { city: 'Manhattan',          state: 'NY' },
  '917': { city: 'New York City',      state: 'NY' },
  '718': { city: 'Brooklyn/Queens/Bronx', state: 'NY' },
  '347': { city: 'Brooklyn/Queens/Bronx', state: 'NY' },
  '929': { city: 'Brooklyn/Queens/Bronx', state: 'NY' },
  '516': { city: 'Nassau County (LI)', state: 'NY' },
  '631': { city: 'Suffolk County (LI)',state: 'NY' },
  '914': { city: 'Westchester',        state: 'NY' },
  '716': { city: 'Buffalo',            state: 'NY' },
  '585': { city: 'Rochester',          state: 'NY' },
  // Florida
  '305': { city: 'Miami',              state: 'FL' },
  '786': { city: 'Miami Metro',        state: 'FL' },
  '954': { city: 'Fort Lauderdale',    state: 'FL' },
  '561': { city: 'Palm Beach County',  state: 'FL' },
  '407': { city: 'Orlando',            state: 'FL' },
  '689': { city: 'Orlando Metro',      state: 'FL' },
  '321': { city: 'Space Coast',        state: 'FL' },
  '813': { city: 'Tampa',              state: 'FL' },
  '727': { city: 'St. Petersburg',     state: 'FL' },
  '941': { city: 'Sarasota',           state: 'FL' },
  '239': { city: 'Naples / Fort Myers',state: 'FL' },
  '904': { city: 'Jacksonville',       state: 'FL' },
  '850': { city: 'Tallahassee / Panhandle', state: 'FL' },
  // Georgia
  '404': { city: 'Atlanta',            state: 'GA' },
  '678': { city: 'Atlanta Metro',      state: 'GA' },
  '770': { city: 'Atlanta Suburbs',    state: 'GA' },
  '470': { city: 'Atlanta Metro',      state: 'GA' },
  '706': { city: 'Augusta / NW Georgia', state: 'GA' },
  '762': { city: 'Augusta / NW Georgia', state: 'GA' },
  '912': { city: 'Savannah',           state: 'GA' },
  // Illinois
  '312': { city: 'Chicago',            state: 'IL' },
  '773': { city: 'Chicago',            state: 'IL' },
  '872': { city: 'Chicago',            state: 'IL' },
  '630': { city: 'Chicago West Suburbs', state: 'IL' },
  '847': { city: 'Chicago North Suburbs', state: 'IL' },
  '708': { city: 'Chicago South Suburbs', state: 'IL' },
  // Ohio
  '614': { city: 'Columbus',           state: 'OH' },
  '216': { city: 'Cleveland',          state: 'OH' },
  '440': { city: 'Cleveland Suburbs',  state: 'OH' },
  '513': { city: 'Cincinnati',         state: 'OH' },
  '937': { city: 'Dayton',             state: 'OH' },
  // Pennsylvania
  '215': { city: 'Philadelphia',       state: 'PA' },
  '267': { city: 'Philadelphia Metro', state: 'PA' },
  '610': { city: 'Philly Suburbs',     state: 'PA' },
  '412': { city: 'Pittsburgh',         state: 'PA' },
  // North Carolina
  '704': { city: 'Charlotte',          state: 'NC' },
  '980': { city: 'Charlotte Metro',    state: 'NC' },
  '919': { city: 'Raleigh',            state: 'NC' },
  '984': { city: 'Raleigh-Durham',     state: 'NC' },
  '336': { city: 'Greensboro',         state: 'NC' },
  // Tennessee
  '615': { city: 'Nashville',          state: 'TN' },
  '629': { city: 'Nashville Metro',    state: 'TN' },
  '901': { city: 'Memphis',            state: 'TN' },
  '865': { city: 'Knoxville',          state: 'TN' },
  // Virginia
  '703': { city: 'Northern Virginia',  state: 'VA' },
  '571': { city: 'Northern Virginia',  state: 'VA' },
  '804': { city: 'Richmond',           state: 'VA' },
  '757': { city: 'Hampton Roads',      state: 'VA' },
  // Colorado
  '303': { city: 'Denver',             state: 'CO' },
  '720': { city: 'Denver Metro',       state: 'CO' },
  '719': { city: 'Colorado Springs',   state: 'CO' },
  '970': { city: 'Northern Colorado',  state: 'CO' },
  // Arizona
  '602': { city: 'Phoenix',            state: 'AZ' },
  '480': { city: 'Scottsdale / East Valley', state: 'AZ' },
  '623': { city: 'West Valley',        state: 'AZ' },
  '520': { city: 'Tucson',             state: 'AZ' },
  // Washington
  '206': { city: 'Seattle',            state: 'WA' },
  '253': { city: 'Tacoma',             state: 'WA' },
  '425': { city: 'Bellevue / Eastside',state: 'WA' },
  // Oregon
  '503': { city: 'Portland',           state: 'OR' },
  '971': { city: 'Portland Metro',     state: 'OR' },
  // Nevada
  '702': { city: 'Las Vegas',          state: 'NV' },
  '725': { city: 'Las Vegas Metro',    state: 'NV' },
  '775': { city: 'Reno',               state: 'NV' },
  // Maryland / DC
  '202': { city: 'Washington DC',      state: 'DC' },
  '301': { city: 'DC Suburbs (MD)',    state: 'MD' },
  '240': { city: 'DC Suburbs (MD)',    state: 'MD' },
  '410': { city: 'Baltimore',          state: 'MD' },
  // Massachusetts
  '617': { city: 'Boston',             state: 'MA' },
  '857': { city: 'Boston',             state: 'MA' },
  '781': { city: 'Boston Suburbs',     state: 'MA' },
  '508': { city: 'Worcester / Cape Cod', state: 'MA' },
  // Michigan
  '313': { city: 'Detroit',            state: 'MI' },
  '248': { city: 'Detroit Suburbs (Oakland)', state: 'MI' },
  '586': { city: 'Detroit Suburbs (Macomb)', state: 'MI' },
  '734': { city: 'Ann Arbor',          state: 'MI' },
  '616': { city: 'Grand Rapids',       state: 'MI' },
  // Minnesota
  '612': { city: 'Minneapolis',        state: 'MN' },
  '651': { city: 'St. Paul',           state: 'MN' },
  '952': { city: 'Minneapolis South Metro', state: 'MN' },
  // Missouri
  '314': { city: 'St. Louis',          state: 'MO' },
  '816': { city: 'Kansas City',        state: 'MO' },
  '417': { city: 'Springfield',        state: 'MO' },
  // Oklahoma
  '405': { city: 'Oklahoma City',      state: 'OK' },
  '918': { city: 'Tulsa',              state: 'OK' },
  // Kansas
  '913': { city: 'Kansas City (Johnson Co.)', state: 'KS' },
  '316': { city: 'Wichita',            state: 'KS' },
  // Indiana
  '317': { city: 'Indianapolis',       state: 'IN' },
  '219': { city: 'Northwest Indiana',  state: 'IN' },
  // Wisconsin
  '414': { city: 'Milwaukee',          state: 'WI' },
  '608': { city: 'Madison',            state: 'WI' },
  // Utah
  '801': { city: 'Salt Lake City',     state: 'UT' },
  '385': { city: 'Salt Lake City',     state: 'UT' },
  // New Mexico
  '505': { city: 'Albuquerque',        state: 'NM' },
  // Alabama
  '205': { city: 'Birmingham',         state: 'AL' },
  '256': { city: 'Huntsville',         state: 'AL' },
  '334': { city: 'Montgomery',         state: 'AL' },
  // Louisiana
  '504': { city: 'New Orleans',        state: 'LA' },
  '225': { city: 'Baton Rouge',        state: 'LA' },
  '318': { city: 'Shreveport',         state: 'LA' },
  // South Carolina
  '843': { city: 'Charleston',         state: 'SC' },
  '803': { city: 'Columbia',           state: 'SC' },
  '864': { city: 'Greenville',         state: 'SC' },
  // New Jersey
  '201': { city: 'North Jersey',       state: 'NJ' },
  '732': { city: 'Central Jersey',     state: 'NJ' },
  '973': { city: 'North Jersey',       state: 'NJ' },
  // Kentucky
  '502': { city: 'Louisville',         state: 'KY' },
  '859': { city: 'Lexington',          state: 'KY' },
  // Arkansas
  '501': { city: 'Little Rock',        state: 'AR' },
  '479': { city: 'Northwest Arkansas (Fayetteville)', state: 'AR' },
  // Connecticut
  '203': { city: 'Bridgeport / New Haven', state: 'CT' },
  '860': { city: 'Hartford',           state: 'CT' },
  // Mississippi
  '601': { city: 'Jackson',            state: 'MS' },
  '228': { city: 'Gulf Coast',         state: 'MS' },
};

// US state full name → abbreviation (for Nominatim results)
const STATE_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
  'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ',
  'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH',
  'Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
  'District of Columbia':'DC',
};

/**
 * lookupAreaCode(areaCode) — quick synchronous lookup, no API call
 * Returns { city, state } or null
 */
export function lookupAreaCode(areaCode) {
  if (!areaCode) return null;
  return AREA_CODE[String(areaCode)] || null;
}

/**
 * normalizeLocation(rawInput)
 *
 * @param {string} rawInput  — whatever the lead typed (e.g. "Dallas", "75201", "972", "DFW")
 * @returns {object|null}    — { raw, city, state, zip, area_code } or null if empty input
 */
export async function normalizeLocation(rawInput) {
  if (!rawInput || !rawInput.trim()) return null;

  const input  = rawInput.trim();
  const upper  = input.toUpperCase().replace(/\s+/g, ' ').trim();

  // ── 1. Metro shorthand ─────────────────────────────────────────────────────
  const token = upper.split(/[\s,\/\-]+/)[0];
  if (METRO[token]) {
    const m = METRO[token];
    return { raw: input, city: m.city, state: m.state, zip: null, area_code: null };
  }

  // ── 2. 5-digit zip code ────────────────────────────────────────────────────
  const zipMatch = input.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    try {
      const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (r.ok) {
        const d = await r.json();
        const pl = d.places?.[0];
        if (pl) {
          return {
            raw:        input,
            city:       pl['place name'],
            state:      pl['state abbreviation'],
            zip,
            area_code:  null,
          };
        }
      }
    } catch { /* fall through */ }
  }

  // ── 3. 3-digit area code (standalone) ─────────────────────────────────────
  const acMatch = input.match(/^\(?(\d{3})\)?$/);
  if (acMatch) {
    const ac = AREA_CODE[acMatch[1]];
    if (ac) {
      return { raw: input, city: ac.city, state: ac.state, zip: null, area_code: acMatch[1] };
    }
  }

  // ── 4. City / freeform → Nominatim geocoding ───────────────────────────────
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&addressdetails=1&countrycodes=us&limit=1`;
    const r   = await fetch(url, {
      headers: { 'User-Agent': 'FranchiseBook/1.0 (steve@sparksify.com)' },
    });
    if (r.ok) {
      const results = await r.json();
      if (results.length > 0) {
        const addr  = results[0].address || {};
        const city  = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
        const state = STATE_ABBR[addr.state] || addr.state || '';
        const zip   = addr.postcode || null;
        if (city || state) {
          return { raw: input, city, state, zip, area_code: null };
        }
      }
    }
  } catch { /* fall through */ }

  // ── 5. Fallback — store raw, clear structured fields ─────────────────────
  return { raw: input, city: null, state: null, zip: null, area_code: null };
}
