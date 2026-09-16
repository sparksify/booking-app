import { GREEN_TEAM_WAREHOUSES, summarizeRoutes } from './greenTeamExpress.mjs';
import { estimateGreenTeamExpress } from './greenTeamEstimate.mjs';

export async function checkGreenTeamExpress(origin, { apiKey = process.env.GOOGLE_MAPS_ROUTES_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) return estimateGreenTeamExpress(origin);
  try {
    const response = await fetchImpl('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,duration,distanceMeters' },
      body: JSON.stringify({ origins: [{ waypoint: { address: `${origin}, USA` } }],
        destinations: GREEN_TEAM_WAREHOUSES.map(warehouse => ({ waypoint: { address: warehouse.address } })),
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', regionCode: 'us', units: 'IMPERIAL' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Routes service returned ${response.status}`);
    const result = summarizeRoutes(await response.json(), origin);
    if (result.status === 'unavailable') return { ...estimateGreenTeamExpress(origin), fallbackReason: 'routes_unavailable' };
    return { ...result, method: 'google_routes', checkedAt: new Date().toISOString() };
  } catch {
    return { ...estimateGreenTeamExpress(origin), fallbackReason: 'routes_unavailable' };
  }
}
