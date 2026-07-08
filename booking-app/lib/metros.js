// Metro definitions for the expansion engine.
//
// A metro is an ordered list of individual cities. The sweep runs them
// sequentially (biggest / densest markets first) through the exact same
// scout -> filter -> discover -> enrich -> outreach pipeline used for a
// single city. Ordering matters: if a search budget runs out mid-sweep,
// the most valuable markets have already been covered.
//
// Each entry in `cities` is passed verbatim as the pipeline `city` value,
// so it must be a Google-Maps-friendly "City, ST" string.

export const METROS = [
  {
    id: 'dfw',
    label: 'DFW Metro (Dallas–Fort Worth)',
    cities: [
      'Dallas, TX', 'Fort Worth, TX', 'Arlington, TX', 'Plano, TX', 'Irving, TX',
      'Frisco, TX', 'McKinney, TX', 'Garland, TX', 'Denton, TX', 'Mesquite, TX',
      'Carrollton, TX', 'Richardson, TX', 'Lewisville, TX', 'Allen, TX', 'Grand Prairie, TX',
      'Flower Mound, TX', 'Grapevine, TX', 'Southlake, TX', 'Rowlett, TX', 'Mansfield, TX',
      'Coppell, TX', 'Euless, TX', 'Bedford, TX', 'Keller, TX', 'The Colony, TX',
      'Prosper, TX', 'Celina, TX', 'Little Elm, TX', 'Wylie, TX', 'Addison, TX',
    ],
  },
  {
    id: 'austin',
    label: 'Greater Austin',
    cities: [
      'Austin, TX', 'Round Rock, TX', 'Cedar Park, TX', 'Georgetown, TX', 'Pflugerville, TX',
      'San Marcos, TX', 'Leander, TX', 'Kyle, TX', 'Buda, TX', 'Lakeway, TX',
    ],
  },
  {
    id: 'houston',
    label: 'Greater Houston',
    cities: [
      'Houston, TX', 'Sugar Land, TX', 'The Woodlands, TX', 'Katy, TX', 'Pearland, TX',
      'Pasadena, TX', 'League City, TX', 'Cypress, TX', 'Spring, TX', 'Conroe, TX',
    ],
  },
  {
    id: 'san_antonio',
    label: 'Greater San Antonio',
    cities: [
      'San Antonio, TX', 'New Braunfels, TX', 'Schertz, TX', 'Boerne, TX',
      'Converse, TX', 'Cibolo, TX', 'Universal City, TX',
    ],
  },
];

export function getMetro(id) {
  return METROS.find(m => m.id === id) || null;
}

// Rough SerpAPI search cost estimate per city, used by the sweep's credit
// guard. Scout is a fixed 2 Maps searches; discover + enrich spend roughly
// ~2 more per business surfaced (owner-name search + email-vendor fallback),
// and scout caps at 30 businesses. This is intentionally conservative so the
// guard stops *before* the real quota is hit, not after.
export const SCOUT_COST = 2;
export const PER_BUSINESS_COST = 2;
export const MAX_BUSINESS_PER_CITY = 30;
export const EST_CITY_COST = SCOUT_COST + PER_BUSINESS_COST * MAX_BUSINESS_PER_CITY; // ~62
