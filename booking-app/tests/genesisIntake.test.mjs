import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as pure from '../lib/genesisIntake.mjs';

function inject(path, deps, names) {
  const code = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/export default /g, '').replace(/export /g, '');
  return new Function(...Object.keys(deps), `${code}\nreturn {${names.join(',')}};`)(...Object.values(deps));
}
function memoryDB() {
  const tables = { genesis_intake: [], pipeline_prospects: [] };
  let failSave = false;
  return { tables, failSave() { failSave = true; }, from(table) {
    let operation = 'select', values, filters = [], ignore = false;
    const q = {
      insert(v) { operation = 'insert'; values = v; return q; },
      upsert(v, opts) { operation = 'upsert'; values = v; ignore = opts?.ignoreDuplicates; return q; },
      update(v) { operation = 'update'; values = v; return q; },
      select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; },
      single: async () => run(true), maybeSingle: async () => run(true), then(resolve, reject) { return Promise.resolve(run(false)).then(resolve, reject); },
    };
    function run(single) {
      if (failSave && table === 'pipeline_prospects') { failSave = false; return { error: { message: 'write failure' } }; }
      let rows = tables[table].filter(row => filters.every(f => f(row)));
      if (operation === 'insert') {
        if (tables[table].some(r => r.request_key === values.request_key)) return { error: { code: '23505' } };
        const row = { id: crypto.randomUUID(), status: 'queued', attempts: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...values };
        tables[table].push(row); rows = [row];
      } else if (operation === 'update') rows.forEach(row => Object.assign(row, values));
      else if (operation === 'upsert') {
        const existing = tables[table].find(r => r.id === values.id);
        if (existing && !ignore) Object.assign(existing, values);
        else if (!existing) tables[table].push({ ...values });
      }
      return { data: structuredClone(single ? rows[0] || null : rows), error: null };
    }
    return q;
  } };
}
function server(overrides = {}) {
  return inject('lib/genesisIntakeServer.js', { crypto, authOptions: {}, ...pure, readPublicPage() {}, verifyEmail() { throw new Error('Unexpected vendor request'); }, discoverOne() { throw new Error('Unexpected discovery'); }, enrichOne() { throw new Error('Unexpected enrichment'); }, outreachOne() { throw new Error('Unexpected outreach'); }, getServerSession: async () => null, getSupabaseAdmin() { throw new Error('Unexpected DB access'); }, getPermissions: async () => ({}), ...overrides }, ['hasBearer', 'submitIntake', 'receipt', 'processIntake', 'dashboardAccess', 'dbData', 'loadIntake']);
}
const lead = { business_name: 'Example Coffee', owner_name: 'Jamie Morgan', email: ' JAMIE@example.com ', phone: '+1 312 555 0100', website: 'example.com', research_notes: 'Research evidence', franchise_information: 'Expansion concept' };
const res = () => ({ code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } });

test('normalizes business/contact/research, routes email directly to verification', () => {
  const normalized = pure.normalizeIntake(lead);
  assert.equal(normalized.email, 'jamie@example.com'); assert.equal(normalized.website, 'https://example.com/');
  assert.equal(normalized.domain, 'example.com'); assert.equal(normalized.phone, lead.phone);
  assert.equal(normalized.research_notes, lead.research_notes); assert.equal(pure.firstStage(normalized), 'verify');
  for (const email of [undefined, null, '']) assert.equal(pure.firstStage(pure.normalizeIntake({ ...lead, email })), 'discover');
  assert.equal(pure.firstStage(pure.normalizeIntake({ business_name: 'Shop', phone: '555-1234' })), 'discover');
});

test('rejects malformed, ambiguous, unsafe, oversized and already-franchised payloads', () => {
  for (const body of [null, [], {}, { business_name: 'Shop' }, { ...lead, email: 'unknown' }, { ...lead, owner_name: {} }, { ...lead, is_franchise: true }, { ...lead, website: 'file:///etc/passwd' }, { ...lead, website: 'https://user:pass@example.com' }, { ...lead, website: 'https://example.com:1234' }, { ...lead, research_notes: 'x'.repeat(12001) }]) assert.throws(() => pure.normalizeIntake(body));
  const safe = pure.normalizeIntake({ ...lead, loadable: true, verification: 'ok', source: 'trusted', smartlead_status: 'loaded' });
  assert.equal(safe.loadable, undefined); assert.equal(safe.verification, undefined); assert.equal(safe.source, 'grok');
});

test('email outcomes fail closed for unavailable or inconclusive validation', () => {
  for (const v of ['catch_all', 'reject', 'unchecked', undefined]) {
    const r = pure.verifiedResult(pure.normalizeIntake(lead), v);
    assert.equal(r.loadable, false); assert.notEqual(pure.finalStatus(r), 'ready_for_review');
  }
  assert.equal(pure.finalStatus(pure.verifiedResult(pure.normalizeIntake(lead), 'ok')), 'ready_for_review');
});

test('bearer auth rejects missing/wrong secrets and protects both API methods', async () => {
  const s = server(); assert.equal(s.hasBearer({ headers: {} }, undefined), false);
  assert.equal(s.hasBearer({ headers: { authorization: 'Bearer test' } }, 'test'), true);
  assert.equal(s.hasBearer({ headers: { authorization: 'Bearer nope' } }, 'test'), false);
  const { handler } = inject('pages/api/genesis/intake.js', { ...s, intakeError: pure.intakeError, getSupabaseAdmin() { throw new Error('Must not touch database'); } }, ['handler']);
  for (const method of ['GET', 'POST']) { const response = res(); await handler({ method, headers: {} }, response); assert.equal(response.code, 401); }
  const response = res(); await handler({ method: 'DELETE', headers: {} }, response); assert.equal(response.code, 405);
});

test('replayed submissions return one receipt; changed data conflicts', async () => {
  const db = memoryDB(), s = server();
  const first = await s.submitIntake(db, lead, 'grok:example-001');
  const retry = await s.submitIntake(db, lead, 'grok:example-001');
  assert.equal(first.id, retry.id); assert.equal(retry.duplicate, true); assert.equal(db.tables.genesis_intake.length, 1);
  await assert.rejects(() => s.submitIntake(db, { ...lead, phone: 'different' }, 'grok:example-001'), e => e.status === 409);
  await assert.rejects(() => s.submitIntake(db, lead, undefined), e => e.status === 400);
});

test('email path calls only verifier, checkpoints, then saves one held prospect', async () => {
  const db = memoryDB(), s = server(); await s.submitIntake(db, lead, 'grok:example-002');
  const candidate = structuredClone(db.tables.genesis_intake[0]); let calls = 0;
  await s.processIntake(db, candidate, { verifyEmail: async email => { calls++; assert.equal(email, 'jamie@example.com'); return 'catch_all'; } });
  assert.equal(db.tables.genesis_intake[0].stage, 'save');
  await s.processIntake(db, candidate); // stale compare-and-set cannot reclaim
  assert.equal(calls, 1);
  await s.processIntake(db, structuredClone(db.tables.genesis_intake[0]));
  assert.equal(db.tables.genesis_intake[0].status, 'complete');
  const p = db.tables.pipeline_prospects[0]; assert.equal(p.smartlead_status, 'held_catch_all'); assert.equal(p.loaded, false);
  assert.equal(p.phone, lead.phone); assert.ok(p.signals.includes(lead.research_notes));
});

test('missing email runs discovery then enrichment, retaining supplied owner and research', async () => {
  const db = memoryDB(), s = server(); await s.submitIntake(db, { ...lead, email: null }, 'grok:example-003');
  const stages = [];
  const deps = { discoverOne: async input => { stages.push('discover'); assert.equal(input.owner_name, 'Jamie Morgan'); return { ...input, website_emails: ['jamie@example.com'] }; }, enrichOne: async input => { stages.push('enrich'); return { ...input, email: 'jamie@example.com', verification: 'ok', enriched: true }; } };
  for (let i = 0; i < 3; i++) await s.processIntake(db, structuredClone(db.tables.genesis_intake[0]), deps);
  assert.deepEqual(stages, ['discover', 'enrich']); assert.equal(db.tables.pipeline_prospects[0].smartlead_status, 'ready_for_review');
  assert.equal(s.receipt(db.tables.genesis_intake[0]).research_notes, lead.research_notes);
});

test('failed stage retries three times; failed saves do not report completion', async () => {
  const db = memoryDB(), s = server(); await s.submitIntake(db, lead, 'grok:example-004');
  for (let i = 0; i < 3; i++) await s.processIntake(db, structuredClone(db.tables.genesis_intake[0]));
  assert.equal(db.tables.genesis_intake[0].status, 'failed'); assert.equal(db.tables.pipeline_prospects.length, 0);
  db.tables.genesis_intake[0] = { ...db.tables.genesis_intake[0], stage: 'save', status: 'queued', attempts: 0, result: pure.verifiedResult(pure.normalizeIntake(lead), 'ok') };
  db.failSave(); await s.processIntake(db, structuredClone(db.tables.genesis_intake[0]));
  assert.equal(db.tables.genesis_intake[0].status, 'queued');
  await s.processIntake(db, structuredClone(db.tables.genesis_intake[0]));
  assert.equal(db.tables.genesis_intake[0].status, 'complete'); assert.equal(db.tables.pipeline_prospects.length, 1);
});

test('public website crawler blocks local, private and metadata IP addresses', () => {
  const { publicIPv4 } = inject('lib/genesisPublicPage.js', {}, ['publicIPv4']);
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '224.0.0.1']) assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('93.184.216.34'), true);
});

test('actual verifier classifies service errors and actual discovery preserves provided owner', async () => {
  for (const [response, expected] of [[{ ok: false }, 'unchecked'], [{ ok: true, json: async () => ({ result: 'unknown' }) }, 'unchecked'], [{ ok: true, json: async () => ({ result: 'invalid' }) }, 'reject'], [{ ok: true, json: async () => ({ result: 'ok' }) }, 'ok']]) {
    const { verifyEmail } = inject('pages/api/pipeline/enrich.js', { process: { env: { MILLIONVERIFIER_API_KEY: 'synthetic' } }, fetch: async () => response }, ['verifyEmail']);
    assert.equal(await verifyEmail('jamie@example.com', { strict: true }), expected);
  }
  const { discoverOne } = inject('pages/api/pipeline/discover.js', { process: { env: {} } }, ['discoverOne']);
  const result = await discoverOne({ ...pure.normalizeIntake(lead), website: null });
  assert.equal(result.owner_name, 'Jamie Morgan'); assert.equal(result.signal, lead.franchise_information);
});

test('dashboard access rejects anonymous, inactive, forbidden and cross-origin callers', async () => {
  await assert.rejects(() => server().dashboardAccess({ method: 'GET' }, res()), e => e.status === 401);
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { email: 'test@example.com' } }) }) };
  const deps = { getServerSession: async () => ({ user: { email: 'test@example.com' } }), getSupabaseAdmin: () => db, getPermissions: async () => ({ page_pipeline: true }) };
  assert.equal(await server(deps).dashboardAccess({ method: 'GET' }, res()), db);
  await assert.rejects(() => server({ ...deps, getPermissions: async () => ({ page_pipeline: false }) }).dashboardAccess({ method: 'GET' }, res()), e => e.status === 403);
  const old = process.env.NEXTAUTH_URL; process.env.NEXTAUTH_URL = 'https://app.trykanso.co';
  try {
    await assert.rejects(() => server(deps).dashboardAccess({ method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' } }, res()), e => e.status === 403);
  } finally { if (old === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = old; }
});

test('concurrent workers claim a stage only once', async () => {
  const db = memoryDB(), s = server(); await s.submitIntake(db, lead, 'grok:example-005');
  const row = structuredClone(db.tables.genesis_intake[0]); let calls = 0;
  const deps = { verifyEmail: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return 'ok'; } };
  await Promise.all([s.processIntake(db, row, deps), s.processIntake(db, row, deps)]);
  assert.equal(calls, 1); assert.equal(db.tables.genesis_intake[0].stage, 'save');
});

test('campaign loading requires verification and atomically prevents double submission', async () => {
  const names = ['SMARTLEAD_API_KEY', 'SMARTLEAD_CAMPAIGN_ID', 'ANTHROPIC_API_KEY'];
  const saved = names.map(name => process.env[name]); names.forEach(name => { process.env[name] = 'synthetic'; });
  try {
    const db = memoryDB(); let sends = 0;
    const s = server({ fetch: async () => ({ ok: true, json: async () => [] }), outreachOne: async input => { sends++; return { ...input, outreach_status: 'loaded' }; } });
    await s.submitIntake(db, lead, 'grok:example-006');
    const row = db.tables.genesis_intake[0]; row.status = 'complete'; row.result = pure.verifiedResult(pure.normalizeIntake(lead), 'catch_all');
    await assert.rejects(() => s.loadIntake(db, row.id), e => e.status === 409); assert.equal(sends, 0);
    row.result = pure.verifiedResult(pure.normalizeIntake(lead), 'ok');
    db.tables.pipeline_prospects.push({ id: row.id, smartlead_status: 'ready_for_review' });
    const results = await Promise.allSettled([s.loadIntake(db, row.id), s.loadIntake(db, row.id)]);
    assert.equal(sends, 1); assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    assert.equal(db.tables.pipeline_prospects[0].loaded, true); assert.equal(s.receipt(row).outcome, 'loaded');
  } finally { names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; }); }
});
