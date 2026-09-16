import { useEffect, useState } from 'react';
import { formatDriveTime, isGreenTeamLead } from '@/lib/greenTeamExpress.mjs';

export default function GreenTeamExpressCard({ booking, lead, contact, tags, interests, territory, active = true, demo = false }) {
  const eligible = isGreenTeamLead({ booking, lead, contact, tags, interests });
  const origin = territory?.origin || '';
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!eligible || !origin || !active || demo) return;
    const controller = new AbortController();
    setResult(null);
    fetch(`/api/dashboard/green-team-express?origin=${encodeURIComponent(origin)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error('Route lookup failed');
        if (!controller.signal.aborted) setResult({ origin, data });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ origin, data: { status: 'unavailable' } }); });
    return () => controller.abort();
  }, [eligible, origin, active, demo, attempt]);

  if (!eligible) return null;
  const data = result?.origin === origin ? result.data : null;
  const estimated = data?.method === 'rough_estimate';
  const positive = data?.status === 'within_range' || data?.status === 'estimated_likely_within';
  const outside = data?.status === 'outside_range' || data?.status === 'estimated_likely_outside';
  const borderline = data?.status === 'estimated_borderline';
  const nearest = data?.nearest;
  const unavailable = data?.status === 'unavailable';
  const title = !origin ? 'Territory needed' : demo ? 'Express location check' : !data ? 'Checking 19 warehouses…'
    : borderline ? 'Borderline — verify the drive'
    : positive ? (estimated ? 'Potential express location · estimate' : 'Potential express location')
    : outside ? (estimated ? 'Estimated outside express range' : 'Outside the express range') : 'Location needs a closer look';
  const timeLabel = warehouse => estimated
    ? `${formatDriveTime(warehouse.durationLowSeconds)}–${formatDriveTime(warehouse.durationHighSeconds)}`
    : formatDriveTime(warehouse.durationSeconds);
  const distanceLabel = warehouse => estimated
    ? warehouse.distanceMiles < 10 ? '<10 mi est.' : `~${warehouse.distanceMiles.toLocaleString()} mi`
    : `${Math.round(warehouse.distanceMiles).toLocaleString()} mi`;

  return (
    <section aria-label="Green Team Express" style={{ padding: 16, marginBottom: 16, borderRadius: 12,
      border: `1px solid ${positive ? '#A7DDB8' : borderline ? '#F2D190' : '#DCE5DF'}`, background: positive ? '#F0FAF3' : borderline ? '#FFFBF0' : '#F8FAF9', color: '#173C2A' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: 8 }}>Green Team · Express</div>
      <div role="status" aria-live="polite" style={{ fontSize: 16, fontWeight: 750 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#52665B', marginTop: 6, lineHeight: 1.5 }}>
        {territory?.primary && <div>Territory: <strong>{territory.primary}</strong></div>}
        {!origin ? 'A resolved city or supported phone area code is needed to check the 5½-hour driving range.'
          : demo ? 'Driving routes are checked automatically for live Green Team leads.'
          : !data ? 'Comparing your territory with all 19 processing warehouses.'
          : borderline ? 'The rough driving range crosses 5h 30m. Check directions before treating this as an express location.'
          : positive ? estimated ? 'The nearest warehouse appears to be within about a 5h 30m drive. Confirm the route.' : `${data.qualifying.length} warehouse${data.qualifying.length === 1 ? '' : 's'} within a 5h 30m drive.`
          : outside ? estimated ? 'The nearest warehouse appears to be beyond a 5h 30m drive. Confirm the route.' : 'No processing warehouse is within a 5h 30m drive.'
          : data.reason === 'location_unknown' ? 'This territory could not be matched to a city. A city and state are needed for a rough estimate.'
          : data.reason === 'road_connection_unknown' ? 'A direct road connection cannot be assumed for this territory. Check travel options manually.'
          : 'Some driving routes could not be checked. Express availability is not confirmed.'}
      </div>
      {nearest && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #DCE5DF' }}>
          <div style={{ fontSize: 10.5, color: '#52665B', marginBottom: 4 }}>{estimated ? 'NEAREST BY GEOGRAPHIC DISTANCE' : data.complete ? 'CLOSEST BY DRIVE TIME' : 'CLOSEST VERIFIED ROUTE'}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, fontWeight: 750, fontSize: 14 }}>
            <span>{nearest.market}</span><span>{timeLabel(nearest)} · {distanceLabel(nearest)}</span>
          </div>
          {estimated && <div style={{ fontSize: 11, color: '#52665B', marginTop: 5 }}>Rough city-to-city projection: {data.originPoint} → {nearest.warehouseCity}</div>}
          <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 5, color: '#52665B' }}>{nearest.address}</div>
          <a href={nearest.directionsUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, marginTop: 9, color: '#166534' }}>View driving directions ↗</a>
        </div>
      )}
      {data?.qualifying?.length > 1 && (
        <details style={{ fontSize: 12, marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{estimated ? 'Other potential warehouses' : 'Other warehouses within range'} ({data.qualifying.length - 1})</summary>
          {data.qualifying.slice(1).map(warehouse => (
            <div key={warehouse.id} style={{ marginTop: 9 }}>
              <a href={warehouse.directionsUrl} target="_blank" rel="noreferrer" style={{ color: '#166534' }}>{warehouse.market} · {timeLabel(warehouse)} · {distanceLabel(warehouse)}</a>
              {estimated && warehouse.rangeAssessment === 'borderline' && <span> · Borderline</span>}
              <div style={{ color: '#52665B', marginTop: 3 }}>{warehouse.address}</div>
            </div>
          ))}
        </details>
      )}
      {data && data.checked !== undefined && !data.complete && (
        <div style={{ fontSize: 11, color: '#92400E', marginTop: 10 }}>Checked {data.checked} of {data.total} warehouses. The closest location may change when all routes are available.</div>
      )}
      {((unavailable && !data.reason) || (data?.checked !== undefined && !data.complete)) && (
        <button onClick={() => { setResult(null); setAttempt(value => value + 1); }} style={{ marginTop: 10, padding: '5px 10px', cursor: 'pointer', background: '#fff', border: '1px solid #BFCFC4', borderRadius: 6, color: '#166534', font: 'inherit', fontSize: 12 }}>Retry check</button>
      )}
      {origin && <div style={{ fontSize: 10.5, color: '#66776D', lineHeight: 1.5, marginTop: 12 }}>
        {territory.source === 'area_code' ? 'Area-code estimate; confirm the client’s actual location. ' : 'Estimate from the territory’s city or region. '}
        {estimated ? <>Rough projection using city locations, an allowance for longer roads, and assumed driving speeds. Actual roads, traffic, mountains, and water crossings may change the drive substantially. Location data: <a href="https://www.census.gov/geographies/reference-files/2025/geo/gazetter-file.html" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>U.S. Census</a>.</> : <>Driving times exclude live traffic. {nearest && 'Routes by Google Maps.'}</>}
        {data?.fallbackReason && <div style={{ marginTop: 4 }}>Routing service unavailable; showing a rough projection.</div>}
      </div>}
    </section>
  );
}
