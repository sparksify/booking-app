import { GREEN_TEAM_WAREHOUSES, EXPRESS_LIMIT_SECONDS, directionsUrl } from './greenTeamExpress.mjs';
import { lookupTerritoryPoint } from './territoryCoordinates.mjs';

const warehouseCities = [
  'Wallingford, CT', 'Carlstadt, NJ', 'Cherry Hill, NJ', 'District Heights, MD', 'Auburn, MA',
  'Mukilteo, WA', 'Portland, OR', 'Sacramento, CA', 'Santa Clara, CA', 'Santa Rosa, CA',
  'Fresno, CA', 'Santa Fe Springs, CA', 'Santee, CA', 'Dallas, TX', 'Houston, TX',
  'Gurnee, IL', 'Altamonte Springs, FL', 'Seminole, FL', 'Dania Beach, FL',
];
const warehousePoints = GREEN_TEAM_WAREHOUSES.map((warehouse, index) => ({
  ...warehouse, point: lookupTerritoryPoint(warehouseCities[index]),
}));

export function straightLineMiles(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const lat = radians(b.lat - a.lat);
  const lng = radians(b.lng - a.lng);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lng / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// Screening assumptions, not a routing model or a statistical confidence interval:
// central = 30% road detour at 55 mph + 15 minutes local travel;
// low/high = 15%/50% detour at 65/45 mph + 10/20 minutes local travel.
// Round displayed projections to 15 minutes and 10 miles to avoid false precision.
export function projectDrive(miles) {
  const round = seconds => Math.max(900, Math.round(seconds / 900) * 900);
  const low = (miles * 1.15 / 65 + 1 / 6) * 3600;
  const high = (miles * 1.5 / 45 + 1 / 3) * 3600;
  return { distanceMiles: Math.round(miles * 1.3 / 10) * 10,
    durationSeconds: round((miles * 1.3 / 55 + 0.25) * 3600),
    durationLowSeconds: Math.max(900, Math.floor(low / 900) * 900),
    durationHighSeconds: Math.ceil(high / 900) * 900,
    rangeAssessment: high <= EXPRESS_LIMIT_SECONDS ? 'likely_within' : low > EXPRESS_LIMIT_SECONDS ? 'likely_outside' : 'borderline' };
}

export function estimateGreenTeamExpress(origin) {
  const point = lookupTerritoryPoint(origin);
  const base = { method: 'rough_estimate', thresholdSeconds: EXPRESS_LIMIT_SECONDS, total: GREEN_TEAM_WAREHOUSES.length };
  if (!point) return { ...base, status: 'unavailable', reason: 'location_unknown' };
  // Geographic distance must not imply a road connection from islands or Alaska.
  if (['AK', 'HI', 'PR'].includes(point.state)) return { ...base, status: 'unavailable', reason: 'road_connection_unknown' };
  const candidates = warehousePoints.filter(warehouse => warehouse.point).map(({ point: destination, ...warehouse }) => {
    const miles = straightLineMiles(point, destination);
    return { ...warehouse, warehouseCity: destination.label, ...projectDrive(miles),
      straightLineMiles: miles, directionsUrl: directionsUrl(origin, warehouse.address) };
  }).sort((a, b) => a.straightLineMiles - b.straightLineMiles);
  const nearest = candidates[0];
  if (!nearest) return { ...base, status: 'unavailable', reason: 'location_unknown' };
  return { ...base, status: `estimated_${nearest.rangeAssessment}`, nearest,
    qualifying: candidates.filter(warehouse => warehouse.rangeAssessment !== 'likely_outside'),
    checked: candidates.length, complete: candidates.length === GREEN_TEAM_WAREHOUSES.length,
    originPoint: point.label, representativeOrigin: point.representative, checkedAt: new Date().toISOString() };
}
