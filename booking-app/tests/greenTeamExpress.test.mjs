import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GREEN_TEAM_WAREHOUSES, EXPRESS_LIMIT_SECONDS, summarizeRoutes, isGreenTeamLead, formatDriveTime } from '../lib/greenTeamExpress.mjs';
import { checkGreenTeamExpress } from '../lib/greenTeamExpressServer.mjs';
import { estimateGreenTeamExpress, projectDrive, straightLineMiles } from '../lib/greenTeamEstimate.mjs';
import { lookupTerritoryPoint } from '../lib/territoryCoordinates.mjs';

function inject(path, deps, names) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/export default /g, '').replace(/export /g, '');
  return new Function(...Object.keys(deps), `${source}\nreturn {${names.join(',')}};`)(...Object.values(deps));
}
const { lookupAreaCode } = inject('lib/normalizeLocation.js', {}, ['lookupAreaCode']);
const { resolveClientTerritory, phoneAreaCode } = inject('lib/clientTerritory.js', { lookupAreaCode }, ['resolveClientTerritory', 'phoneAreaCode']);
const element = (index, seconds = 30000, extra = {}) => ({ originIndex: 0, destinationIndex: index, status: {}, condition: 'ROUTE_EXISTS', duration: `${seconds}s`, distanceMeters: 200000, ...extra });
const matrix = () => GREEN_TEAM_WAREHOUSES.map((_, index) => element(index));

test('catalog contains all 19 distinct physical warehouse locations', () => {
  assert.equal(GREEN_TEAM_WAREHOUSES.length, 19);
  assert.equal(new Set(GREEN_TEAM_WAREHOUSES.map(w => w.id)).size, 19);
  assert.match(GREEN_TEAM_WAREHOUSES.find(w => w.id === 'san-francisco').address, /Santa Clara/);
  assert.match(GREEN_TEAM_WAREHOUSES.find(w => w.id === 'chicago').address, /Gurnee/);
});
test('Green Team detection covers brand slugs, booking brands, interests, custom fields and tags', () => {
  for (const input of [{lead:{brand_slug:'greenteam'}}, {booking:{brand:'Green Team'}}, {interests:[{brand:'Green Team'}]}, {contact:{custom_fields:{'Franchise Brand':'Green Team'}}}, {tags:['green-team']}, {booking:{event_name:'Green Team Discovery Call'}}]) assert.equal(isGreenTeamLead(input), true);
  for (const input of [{}, {lead:{brand:'CMDT'}}, {tags:['evergreenteam']}, {lead:{notes:'green team'}}]) assert.equal(isGreenTeamLead(input), false);
});
test('phone area code accepts NANP formats and rejects short and international numbers', () => {
  assert.equal(phoneAreaCode('+1 (512) 555-0199'), '512');
  assert.equal(phoneAreaCode('2145550199'), '214');
  assert.equal(phoneAreaCode('+44 20 7946 0958'), null);
  assert.equal(phoneAreaCode('512'), null);
});
test('late data from a previous client cannot select a brand or territory for the current client', () => {
  const booking = {email:'current@example.com', phone:'5125550199', brand:'CMDT'};
  const lead = {email:'previous@example.com', brand_slug:'greenteam', location_city:'Boston', location_state:'MA'};
  const contact = {email:'previous@example.com', city:'Boston', state:'MA', tags:['green team']};
  assert.equal(isGreenTeamLead({booking,lead,contact,interests:[{brand:'Green Team'}]}), false);
  assert.equal(resolveClientTerritory({booking,lead,contact}).origin, 'Austin, TX');
});
test('shared territory uses the displayed location, then falls back to the phone area code', () => {
  const resolved = resolveClientTerritory({lead:{phone:'5125550199'}});
  assert.deepEqual(resolved, {primary:'Austin, TX', sub:'Area code 512', origin:'Austin, TX', source:'area_code'});
  assert.equal(resolveClientTerritory({lead:{location_city:'Boston',location_state:'MA',phone:'5125550199'}}).origin, 'Boston, MA');
  assert.equal(resolveClientTerritory({contact:{city:'Dallas',state:'TX',area_code:'214',location_source:'area_code'}}).source, 'area_code');
  assert.equal(resolveClientTerritory({lead:{location_state:'Texas',phone:'5125550199'}}).origin, null);
  assert.equal(resolveClientTerritory({lead:{phone:'8005550199',raw_fields:'invalid json'}}), null);
});
test('5.5 hour cutoff is inclusive, raw seconds decide eligibility, and order is by drive time', () => {
  const rows = matrix(); rows[13] = element(13, EXPRESS_LIMIT_SECONDS); rows[14] = element(14, EXPRESS_LIMIT_SECONDS + 1);
  const result = summarizeRoutes(rows.reverse(), 'Austin, TX');
  assert.equal(result.status, 'within_range'); assert.equal(result.nearest.id, 'dallas');
  assert.equal(result.qualifying.length, 1); assert.equal(result.complete, true);
  assert.equal(formatDriveTime(EXPRESS_LIMIT_SECONDS + 1), '5h 31m');
  const url = new URL(result.nearest.directionsUrl);
  assert.equal(url.searchParams.get('origin'), 'Austin, TX');
  assert.equal(url.searchParams.get('destination'), GREEN_TEAM_WAREHOUSES[13].address);
});
test('all completed routes beyond threshold report outside range and show closest', () => {
  const result = summarizeRoutes(matrix(), 'Denver, CO');
  assert.equal(result.status, 'outside_range'); assert.ok(result.nearest); assert.equal(result.checked, 19);
});
test('missing or failed routes never incorrectly rule out express availability', () => {
  for (const rows of [matrix().slice(1), matrix().map((row,i) => i ? row : {...row,status:{code:7}}), [], [element(0, 1, {distanceMeters: '10'})], [element(0, 1, {duration:'bad'})]]) {
    const result = summarizeRoutes(rows, 'Test, TX');
    assert.equal(result.status, 'unavailable'); assert.equal(result.complete, false);
  }
  const partial = summarizeRoutes([element(13, 300)], 'Dallas, TX');
  assert.equal(partial.status, 'within_range'); assert.equal(partial.complete, false);
});
test('unreachable routes are distinct from provider failures, duplicate indices do not inflate coverage', () => {
  const rows = matrix().map(row => ({...row,condition:'ROUTE_NOT_FOUND'}));
  assert.equal(summarizeRoutes(rows, 'Honolulu, HI').status, 'outside_range');
  assert.equal(summarizeRoutes(rows, 'Honolulu, HI').nearest, null);
  assert.equal(summarizeRoutes([...matrix(), element(0)], 'Denver, CO').complete, false);
});
test('route request compares all 19 addresses using driving times without traffic', async () => {
  let called = false;
  const result = await checkGreenTeamExpress('Austin, TX', {apiKey:'test-key', fetchImpl:async (url, options) => {
    called = true; assert.equal(url, 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix');
    const body = JSON.parse(options.body);
    assert.equal(body.origins[0].waypoint.address, 'Austin, TX, USA');
    assert.equal(body.destinations.length, 19); assert.equal(body.travelMode, 'DRIVE'); assert.equal(body.routingPreference, 'TRAFFIC_UNAWARE');
    assert.match(options.headers['X-Goog-FieldMask'], /status/);
    return {ok:true,json:async()=>matrix()};
  }});
  assert.ok(called); assert.equal(result.status, 'outside_range'); assert.ok(result.checkedAt);
});
test('missing key uses offline estimates without making any external call', async () => {
  let calls=0;
  const result=await checkGreenTeamExpress('Austin, TX',{apiKey:'',fetchImpl:()=>{calls++;throw Error('must not call');}});
  assert.equal(calls,0); assert.equal(result.method,'rough_estimate'); assert.equal(result.status,'estimated_likely_within');
  assert.equal(result.checked,19); assert.ok(result.nearest.durationLowSeconds < result.nearest.durationHighSeconds);
});
test('provider errors, malformed responses, incomplete matrices and timeouts fall back to labeled estimates', async () => {
  for (const fetchImpl of [async()=>({ok:false,status:403}), async()=>({ok:true,json:async()=>({error:'failed'})}),
    async()=>({ok:true,json:async()=>[]}), async()=>{throw new DOMException('timeout','TimeoutError');}]) {
    const result=await checkGreenTeamExpress('Austin, TX',{apiKey:'x',fetchImpl});
    assert.equal(result.method,'rough_estimate'); assert.equal(result.fallbackReason,'routes_unavailable');
    assert.notEqual(result.status,'outside_range');
  }
});
test('every existing area-code region and metro label has an offline representative point', () => {
  const source=readFileSync(new URL('../lib/normalizeLocation.js',import.meta.url),'utf8');
  const regions=[...source.matchAll(/city:\s*'([^']+)'\s*,?\s*state:\s*'([^']+)'/g)].map(m=>`${m[1]}, ${m[2]}`);
  assert.ok(regions.length > 150);
  for (const region of regions) assert.ok(lookupTerritoryPoint(region),region);
  assert.equal(lookupTerritoryPoint('Chicago North Suburbs, IL').label,'Northbrook, IL');
  assert.equal(lookupTerritoryPoint('Chicago North Suburbs, IL').representative,true);
});
test('city/state matching supports full state names and rejects ambiguous or unknown locations', () => {
  assert.equal(lookupTerritoryPoint('Austin, Texas').label,'Austin, TX');
  for(const origin of ['Texas','Austin','Imaginary Town, TX','Portland, ZZ','Mount Olive, AL']) assert.equal(lookupTerritoryPoint(origin),null,origin);
  assert.equal(resolveClientTerritory({lead:{raw_fields:{territory:'Austin, TX'}}}).origin,'Austin, TX');
  assert.equal(resolveClientTerritory({lead:{location_raw:'512'}}).origin,'Austin, TX');
});
test('geographic projection uses warehouse towns rather than market names and preserves directions addresses', () => {
  const result=estimateGreenTeamExpress('Santa Clara, CA');
  assert.equal(result.nearest.id,'san-francisco'); assert.equal(result.nearest.warehouseCity,'Santa Clara, CA');
  assert.equal(result.nearest.straightLineMiles,0); assert.ok(result.nearest.durationLowSeconds > 0);
  assert.match(new URL(result.nearest.directionsUrl).searchParams.get('destination'),/3261 Keller St/);
  assert.equal(result.checked,19); assert.equal(result.complete,true);
});
test('rough estimates flag borderline drives rather than asserting the 5.5 hour cutoff', () => {
  assert.equal(projectDrive(155).rangeAssessment,'likely_within');
  assert.equal(projectDrive(155.01).rangeAssessment,'borderline');
  assert.equal(projectDrive(301).rangeAssessment,'borderline');
  assert.equal(projectDrive(302).rangeAssessment,'likely_outside');
  assert.equal(estimateGreenTeamExpress('Detroit, MI').status,'estimated_borderline');
  assert.equal(estimateGreenTeamExpress('Denver, CO').status,'estimated_likely_outside');
});
test('offline estimates never imply mainland road connectivity from islands or Alaska', () => {
  for(const origin of ['Honolulu, HI','Anchorage, AK','San Juan, PR']) {
    const result=estimateGreenTeamExpress(origin);
    assert.equal(result.status,'unavailable'); assert.ok(!result.nearest);
  }
  assert.equal(estimateGreenTeamExpress('Unknown, TX').reason,'location_unknown');
});
test('haversine distance is symmetric, zero for identical points and plausible for known separation', () => {
  const a=lookupTerritoryPoint('Dallas, TX'),b=lookupTerritoryPoint('Houston, TX');
  assert.equal(straightLineMiles(a,a),0);
  assert.equal(straightLineMiles(a,b),straightLineMiles(b,a));
  assert.ok(straightLineMiles(a,b)>200 && straightLineMiles(a,b)<250);
});
const response = () => ({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(){return this;}});
test('endpoint enforces authentication, page permissions, method and origin validation before routing', async () => {
  let calls=0;
  const route = (overrides={}) => inject('pages/api/dashboard/green-team-express.js', {authOptions:{},getServerSession:async()=>({user:{email:'rep@example.com'}}),getPermissions:async()=>({page_leads:true}),checkGreenTeamExpress:async()=>{calls++;return {status:'within_range'};},...overrides},['handler']).handler;
  for (const [req, overrides, status] of [
    [{method:'POST'}, {}, 405], [{method:'GET'}, {getServerSession:async()=>null}, 401],
    [{method:'GET'}, {getPermissions:async()=>({})}, 403],
    [{method:'GET',query:{origin:['Dallas','Boston']}},{},400],
    [{method:'GET',query:{origin:''}},{},400],
  ]) {const res=response(); await route(overrides)(req,res); assert.equal(res.statusCode,status);}
  assert.equal(calls,0);
  const res=response(); await route()({method:'GET',query:{origin:'Dallas, TX'}},res);
  assert.equal(calls,1); assert.equal(res.body.status,'within_range'); assert.equal(res.headers['Cache-Control'],'private, no-store');
});
