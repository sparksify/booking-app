export const EXPRESS_LIMIT_SECONDS = 5.5 * 60 * 60;

// Supplied processing locations. Route to the physical address, not the market label.
export const GREEN_TEAM_WAREHOUSES = [
  ['new-haven', 'New Haven, CT', '34 Capital Dr, Wallingford, CT 06492'],
  ['new-york', 'New York', '65 Triangle Blvd, Carlstadt, NJ 07072'],
  ['philadelphia', 'Philadelphia', '1960 Old Cuthbert Rd, Unit 150, Cherry Hill, NJ 08034'],
  ['washington', 'Washington, D.C.', '8012 Cryden Way, District Heights, MD 20747'],
  ['boston', 'Boston', '36 Sword St, Building 11A, Auburn, MA 01501'],
  ['seattle', 'Seattle', '4470 Chennault Beach Rd, Mukilteo, WA 98275'],
  ['portland', 'Portland', '6650 N Basin Ave, Suite 1, Portland, OR 97217'],
  ['sacramento', 'Sacramento', '4500 Beloit Dr, Suite B, Sacramento, CA 95838'],
  ['san-francisco', 'San Francisco', '3261 Keller St, Santa Clara, CA 95054'],
  ['santa-rosa', 'Santa Rosa', '255 Sutten Pl, Santa Rosa, CA 95407'],
  ['fresno', 'Fresno', '4055 W Shaw Ave, Suite 110, Fresno, CA 93722'],
  ['los-angeles', 'Los Angeles', '12335 McCann Dr, Santa Fe Springs, CA 90670'],
  ['san-diego', 'San Diego', '8710 Cottonwood Ave, Santee, CA 92071'],
  ['dallas', 'Dallas', '2614 Andjon Dr, Dallas, TX 75220'],
  ['houston', 'Houston', '2700 Greens Rd, E200, Houston, TX 77032'],
  ['chicago', 'Chicago', '4090 Ryan Rd, Unit A, Gurnee, IL 60031'],
  ['orlando', 'Orlando', '217 Altamonte Commerce Blvd, Suite 1214, Altamonte Springs, FL 32714'],
  ['tampa', 'Tampa', '6911 Bryan Dairy Rd, Suite 270, Seminole, FL 33777'],
  ['miami', 'Miami', '1900 NE 7th Ave, Suite A, Dania Beach, FL 33004'],
].map(([id, market, address]) => ({ id, market, address }));

export function isGreenTeamLead({ booking, lead, contact, tags = [], interests = [] } = {}) {
  if (booking?.email && lead?.email && booking.email.toLowerCase() !== lead.email.toLowerCase()) {
    lead = null;
    interests = [];
  }
  if (booking?.email && contact?.email && booking.email.toLowerCase() !== contact.email.toLowerCase()) contact = null;
  const norm = value => typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const cf = contact?.custom_fields || {};
  const brands = [booking?.brand, booking?.brand_slug, lead?.brand, lead?.brand_slug,
    lead?.franchise_brand, cf['Franchise Brand'], cf['Brand Name'], cf['Franchise Name'],
    ...interests.map(item => item.brand), ...(lead?.franchise_interests || []).map(item => item.brand)];
  if (brands.some(value => norm(value) === 'greenteam')) return true;
  return [...tags, ...(contact?.tags || []), booking?.event_name]
    .some(value => typeof value === 'string' && /\bgreen[\s_-]*team\b/i.test(value));
}

export function directionsUrl(origin, address) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin, destination: address, travelmode: 'driving' })}`;
}

export function formatDriveTime(seconds) {
  // Round up so a drive just beyond the cutoff never displays as 5h 30m.
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function summarizeRoutes(elements, origin) {
  if (!Array.isArray(elements)) throw new Error('Invalid route matrix');
  const routes = [];
  let checked = 0;
  for (const [index, warehouse] of GREEN_TEAM_WAREHOUSES.entries()) {
    const matches = elements.filter(item => item?.originIndex === 0 && item.destinationIndex === index);
    if (matches.length !== 1) continue;
    const element = matches[0];
    if (element.status?.code) continue;
    if (element.condition === 'ROUTE_NOT_FOUND') { checked++; continue; }
    const duration = typeof element.duration === 'string' && element.duration.match(/^(\d+(?:\.\d+)?)s$/);
    if (element.condition !== 'ROUTE_EXISTS' || !duration ||
        !Number.isFinite(element.distanceMeters) || element.distanceMeters < 0) continue;
    const durationSeconds = Number(duration[1]);
    if (!Number.isFinite(durationSeconds)) continue;
    checked++;
    routes.push({ ...warehouse, durationSeconds, distanceMiles: element.distanceMeters / 1609.344,
      withinRange: durationSeconds <= EXPRESS_LIMIT_SECONDS, directionsUrl: directionsUrl(origin, warehouse.address) });
  }
  routes.sort((a, b) => a.durationSeconds - b.durationSeconds || a.distanceMiles - b.distanceMiles);
  const qualifying = routes.filter(route => route.withinRange);
  const complete = checked === GREEN_TEAM_WAREHOUSES.length;
  return { status: qualifying.length ? 'within_range' : complete ? 'outside_range' : 'unavailable',
    nearest: routes[0] || null, qualifying, checked, total: GREEN_TEAM_WAREHOUSES.length, complete,
    thresholdSeconds: EXPRESS_LIMIT_SECONDS };
}
