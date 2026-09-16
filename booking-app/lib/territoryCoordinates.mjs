// Server-only offline lookup. Census representative points are city/region
// approximations, not a geocode of the client's home or the warehouse street.
import places from './data/usPlaceCoordinates.mjs';

const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const states = 'Alabama|AL;Alaska|AK;Arizona|AZ;Arkansas|AR;California|CA;Colorado|CO;Connecticut|CT;Delaware|DE;District of Columbia|DC;Florida|FL;Georgia|GA;Hawaii|HI;Idaho|ID;Illinois|IL;Indiana|IN;Iowa|IA;Kansas|KS;Kentucky|KY;Louisiana|LA;Maine|ME;Maryland|MD;Massachusetts|MA;Michigan|MI;Minnesota|MN;Mississippi|MS;Missouri|MO;Montana|MT;Nebraska|NE;Nevada|NV;New Hampshire|NH;New Jersey|NJ;New Mexico|NM;New York|NY;North Carolina|NC;North Dakota|ND;Ohio|OH;Oklahoma|OK;Oregon|OR;Pennsylvania|PA;Rhode Island|RI;South Carolina|SC;South Dakota|SD;Tennessee|TN;Texas|TX;Utah|UT;Vermont|VT;Virginia|VA;Washington|WA;West Virginia|WV;Wisconsin|WI;Wyoming|WY;Puerto Rico|PR'.split(';');
const stateCodes = new Map(states.flatMap(row => { const [name, code] = row.split('|'); return [[normalize(name), code], [normalize(code), code]]; }));
const byName = new Map();
for (const [city, state, lat, lng] of places) {
  const key = `${normalize(city)},${state}`;
  const matches = byName.get(key) || [];
  matches.push({ label: `${city}, ${state}`, state, lat, lng });
  byName.set(key, matches);
}

// Representative cities for the existing area-code region labels. These are
// explicit approximations; never silently substitute a different client's city.
const aliases = new Map([
  ['Nashville, TN', 'Nashville-Davidson, TN'], ['Lexington, KY', 'Lexington-Fayette urban county, KY'],
  ['Dallas-Fort Worth, TX', 'Dallas, TX'], ['Rio Grande Valley, TX', 'McAllen, TX'],
  ['East Texas (Tyler), TX', 'Tyler, TX'], ['East Texas, TX', 'Lufkin, TX'],
  ['Southeast Texas, TX', 'Beaumont, TX'], ['Midland-Odessa, TX', 'Midland, TX'],
  ['West Texas (Lubbock), TX', 'Lubbock, TX'], ['Texas Hill Country, TX', 'Kerrville, TX'],
  ['West LA / South Bay, CA', 'Torrance, CA'], ['San Fernando Valley, CA', 'San Fernando, CA'],
  ['Pasadena / SGV, CA', 'Pasadena, CA'], ['Orange County, CA', 'Santa Ana, CA'],
  ['South Orange County, CA', 'Irvine, CA'], ['Riverside / IE, CA', 'Riverside, CA'],
  ['San Bernardino / IE, CA', 'San Bernardino, CA'], ['North San Diego, CA', 'San Diego, CA'],
  ['Palm Springs / N SD, CA', 'Palm Springs, CA'], ['Silicon Valley, CA', 'San Jose, CA'],
  ['SF Peninsula, CA', 'San Mateo, CA'], ['East Bay (Oakland), CA', 'Oakland, CA'],
  ['Contra Costa Co., CA', 'Concord, CA'], ['Central Coast, CA', 'San Luis Obispo, CA'],
  ['San Francisco Bay Area, CA', 'San Francisco, CA'],
  ['Manhattan, NY', 'New York, NY'], ['New York City, NY', 'New York, NY'],
  ['Brooklyn/Queens/Bronx, NY', 'New York, NY'], ['Nassau County (LI), NY', 'Hempstead, NY'],
  ['Suffolk County (LI), NY', 'Islip, NY'], ['Westchester, NY', 'White Plains, NY'],
  ['Palm Beach County, FL', 'West Palm Beach, FL'], ['Space Coast, FL', 'Melbourne, FL'],
  ['Naples / Fort Myers, FL', 'Fort Myers, FL'], ['Tallahassee / Panhandle, FL', 'Tallahassee, FL'],
  ['Augusta / NW Georgia, GA', 'Augusta-Richmond County, GA'],
  ['Chicago West Suburbs, IL', 'Naperville, IL'], ['Chicago North Suburbs, IL', 'Northbrook, IL'],
  ['Chicago South Suburbs, IL', 'Orland Park, IL'], ['Philly Suburbs, PA', 'Norristown, PA'],
  ['Raleigh-Durham, NC', 'Raleigh, NC'], ['Northern Virginia, VA', 'Arlington, VA'],
  ['Hampton Roads, VA', 'Norfolk, VA'], ['Northern Colorado, CO', 'Fort Collins, CO'],
  ['Scottsdale / East Valley, AZ', 'Scottsdale, AZ'], ['West Valley, AZ', 'Glendale, AZ'],
  ['Bellevue / Eastside, WA', 'Bellevue, WA'], ['Washington DC, DC', 'Washington, DC'],
  ['DC Suburbs (MD), MD', 'Silver Spring, MD'], ['Worcester / Cape Cod, MA', 'Worcester, MA'],
  ['Detroit Suburbs (Oakland), MI', 'Pontiac, MI'], ['Detroit Suburbs (Macomb), MI', 'Warren, MI'],
  ['Minneapolis South Metro, MN', 'Bloomington, MN'], ['Kansas City (Johnson Co.), KS', 'Overland Park, KS'],
  ['Northwest Indiana, IN', 'Gary, IN'], ['North Jersey, NJ', 'Newark, NJ'],
  ['Central Jersey, NJ', 'New Brunswick, NJ'], ['Northwest Arkansas (Fayetteville), AR', 'Fayetteville, AR'],
  ['Bridgeport / New Haven, CT', 'New Haven, CT'], ['Gulf Coast, MS', 'Gulfport, MS'],
].map(([alias, target]) => [normalize(alias), target]));

export function lookupTerritoryPoint(origin) {
  if (typeof origin !== 'string') return null;
  const parts = origin.trim().split(',').map(part => part.trim());
  if (parts.length !== 2 || !parts[0]) return null;
  const state = stateCodes.get(normalize(parts[1]));
  if (!state) return null;
  const canonical = `${parts[0]}, ${state}`;
  const city = parts[0].replace(/ (?:metro|suburbs)$/i, '');
  const alias = aliases.get(normalize(canonical)) || aliases.get(normalize(`${city}, ${state}`));
  const target = alias ? alias.split(',')[0].trim() : city;
  const matches = byName.get(`${normalize(target)},${state}`);
  // Duplicate names within a state require a more precise location.
  if (matches?.length !== 1) return null;
  return { ...matches[0], representative: !!alias || city !== parts[0] };
}
