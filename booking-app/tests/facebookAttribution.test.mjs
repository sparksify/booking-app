import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import * as attribution from '../lib/facebookAttribution.mjs';
import { isGreenTeamLead } from '../lib/greenTeamExpress.mjs';

const jacksonville = '120247877373450452';
const campaign = attribution.GREEN_TEAM_CAMPAIGN_ID;
function inject(path, deps, names) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export default /g, '').replace(/export /g, '');
  return new Function(...Object.keys(deps), `${source}\nreturn {${names.join(',')}};`)(...Object.values(deps));
}
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }, end() { return this; } });

test('verified city ad set IDs resolve even without brand metadata; broad sets have no express city', () => {
  const cities = attribution.GREEN_TEAM_ADSETS.filter(item => item.area);
  assert.equal(cities.length, 4);
  for (const item of attribution.GREEN_TEAM_ADSETS) {
    const lead = { fb_adset_id: item.id };
    const source = attribution.resolveFacebookSource({ lead });
    assert.equal(source.area, item.area);
    assert.equal(source.adsetName, item.name);
    assert.equal(isGreenTeamLead({ lead }), true);
  }
});

test('normalizes mapped and Meta field names, preserving exact IDs and rejecting unsafe numbers/placeholders', () => {
  assert.deepEqual(attribution.facebookAttribution({ fb_adset_id: jacksonville, campaign_id: campaign,
    ad_name: 'City ad', ad_set_name: 'Jacksonville', ad_id: 123 }), {
    fb_ad_id: '123', fb_adset_id: jacksonville, fb_campaign_id: campaign,
    fb_ad_name: 'City ad', fb_adset_name: 'Jacksonville',
  });
  assert.deepEqual(attribution.facebookAttribution({ fb_adset_id: Number(jacksonville), campaign_id: '{{1.campaign_id}}', ad_id: '/me' }), {});
  assert.deepEqual(attribution.facebookAttributionColumns({ adset_id: jacksonville, adset_name: 'City' }), { fb_adset_id: jacksonville });
  assert.deepEqual(attribution.facebookAttributionColumns({ adset_id: `"${jacksonville}"`, campaign_id: `"${campaign}"` }), { fb_adset_id: jacksonville, fb_campaign_id: campaign });
  assert.equal(attribution.resolveFacebookSource({ lead: { raw_fields: JSON.stringify({ adset_id: jacksonville }) } }).area, 'Jacksonville, FL');
});

test('unknown, non-Facebook and other client/campaign records do not acquire city attribution', () => {
  assert.equal(attribution.resolveFacebookSource({ lead: { location_city: 'Jacksonville', brand_slug: 'greenteam' } }), null);
  assert.equal(attribution.resolveFacebookSource({ lead: { fb_adset_id: jacksonville, fb_campaign_id: '999' } }).area, null);
  assert.equal(attribution.resolveFacebookSource({ booking: { email: 'current@example.com' }, lead: { email: 'previous@example.com', fb_adset_id: jacksonville } }), null);
  assert.equal(attribution.resolveFacebookSource({ lead: { fb_lead_id: '123', raw_fields: 'broken json' } }).adsetName, null);
  assert.equal(attribution.resolveFacebookSource({ lead: { raw_fields: { fb_ad_name: 'Jacksonville promotion' } } }).area, null);
  assert.equal(attribution.resolveFacebookSource({ lead: { fb_campaign_id: campaign, fb_adset_id: '999', raw_fields: { fb_adset_name: 'New city' } } }).area, null);
});

function fakeDb(existing = null, failUpdate = false) {
  const writes = [];
  return { writes, from(table) {
    const chain = {
      select() { return chain; }, eq() { return chain; }, contains() { return chain; },
      maybeSingle: async () => ({ data: table === 'leads' ? existing : null }),
      insert(row) { writes.push({ type: 'insert', table, row }); return chain; },
      upsert(row) { writes.push({ type: 'upsert', table, row }); return chain; },
      update(row) { writes.push({ type: 'update', table, row }); return chain; },
      single: async () => ({ data: { id: 'lead-1', token: 'saved-token' } }),
      then(resolve) { return Promise.resolve({ error: failUpdate ? { message: 'write failed' } : null }).then(resolve); },
    };
    return chain;
  } };
}
function pabbly(db) {
  return inject('pages/api/webhooks/pabbly.js', { crypto, ...attribution, getSupabaseAdmin: () => db,
    sendLeadAlert: async () => { throw Error('No notifications in test'); },
    upsertGHLContact: async () => { throw Error('No contact sync in test'); } }, ['handler']).handler;
}

test('Pabbly intake saves source IDs and names alongside answers without a schema change', async () => {
  const db = fakeDb(); const res = response();
  await pabbly(db)({ method: 'POST', query: {}, headers: {}, body: {
    fb_lead_id: '123', fb_adset_id: jacksonville, fb_campaign_id: campaign,
    fb_adset_name: 'Jacksonville FL - Entrepreneurship (business & finance)', city: 'Boston, MA',
  } }, res);
  assert.equal(res.statusCode, 200);
  const row = db.writes.find(w => w.type === 'insert').row;
  assert.equal(row.fb_adset_id, jacksonville);
  assert.equal(row.fb_campaign_id, campaign);
  assert.equal(row.raw_fields.city, 'Boston, MA');
  assert.equal(attribution.resolveFacebookSource({ lead: row }).area, 'Jacksonville, FL');
});

test('Pabbly replay fills attribution without resending alerts, replacing answers or resetting lifecycle', async () => {
  const existing = { id: 'lead-1', token: 'original-token', ghl_contact_id: 'existing-contact', raw_fields: { city: 'Boston, MA' } };
  const db = fakeDb(existing); const res = response();
  await pabbly(db)({ method: 'POST', query: {}, headers: {}, body: {
    fb_lead_id: '123', fb_adset_id: jacksonville, fb_adset_name: 'Jacksonville', ghl_contact_id: 'replacement', city: 'Changed',
  } }, res);
  assert.equal(res.body.duplicate, true);
  assert.equal(res.body.token, 'original-token');
  assert.equal(db.writes.length, 1);
  const row = db.writes[0].row;
  assert.equal(row.fb_adset_id, jacksonville);
  assert.equal(row.raw_fields.city, 'Boston, MA');
  for (const key of ['token', 'status', 'ghl_contact_id', 'email']) assert.equal(row[key], undefined);
  const failed = response();
  await pabbly(fakeDb(existing, true))({ method: 'POST', query: {}, headers: {}, body: { fb_lead_id: '123', fb_adset_id: jacksonville } }, failed);
  assert.equal(failed.statusCode, 500);
});

test('native Facebook delivery uses source metadata fetched from the lead when absent in webhook', async () => {
  const db = fakeDb();
  const { handler } = inject('pages/api/webhooks/facebook.js', { crypto, ...attribution,
    getSupabaseAdmin: () => db, getLeadData: async () => ({ adset_id: jacksonville, campaign_id: campaign, adset_name: 'Jacksonville', field_data: [] }),
    parseLeadFields: () => ({ raw: {} }), generateToken: () => 'token',
    logLeadEvent: async () => {}, normalizeLocation: async () => null, isBusinessEmail: () => false,
    runCompanyIntel: async () => {}, upsertGHLContact: async () => null,
  }, ['handler']);
  const req = Readable.from([JSON.stringify({ entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: '123' } }] }] })]);
  req.method = 'POST'; req.headers = {};
  const res = response(); await handler(req, res);
  const row = db.writes.find(w => w.type === 'upsert').row;
  assert.equal(row.fb_adset_id, jacksonville);
  assert.equal(row.fb_campaign_id, campaign);
  assert.equal(row.raw_fields.fb_adset_name, 'Jacksonville');
});
