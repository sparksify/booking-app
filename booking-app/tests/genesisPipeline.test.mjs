import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOwnerNames, personParts } from '../lib/pipeline/ownerNames.mjs';
import { candidatesFromMention, emailMatchesOwner, inboxKind, judgeCandidates } from '../lib/pipeline/ownerGate.mjs';
import { enrichLead } from '../lib/pipeline/genesisEnrich.mjs';
import { dryRunDependencies, memoryStore, runGenesis } from '../lib/pipeline/genesisRun.mjs';
import { identifyOwner } from '../lib/pipeline/identifyOwner.mjs';
import { combineVerification } from '../lib/pipeline/verifyDecision.mjs';
import { pipelineAuthorized } from '../lib/pipeline/authDecision.mjs';
import { leadsToCsv, pipelineStats } from '../lib/pipeline/dashboardStats.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(path.join(root, file), 'utf8');

test('owner names split on semicolon, and, ampersand, and comma, and drop middle names and suffixes', () => {
  assert.deepEqual(parseOwnerNames('John Smith; Jane Doe'), ['John Smith', 'Jane Doe']);
  assert.deepEqual(parseOwnerNames('John Smith and Jane Doe'), ['John Smith', 'Jane Doe']);
  assert.deepEqual(parseOwnerNames('John Smith & Jane Doe'), ['John Smith', 'Jane Doe']);
  assert.deepEqual(parseOwnerNames('John Smith, Jane Doe'), ['John Smith', 'Jane Doe']);
  assert.deepEqual(personParts('John Michael Smith'), { first: 'John', last: 'Smith', full: 'John Smith', middle: ['Michael'] });
  assert.deepEqual(personParts('Dr. John Smith Jr.'), { first: 'John', last: 'Smith', full: 'John Smith', middle: [] });
  assert.equal(personParts('J Smith'), null);
  assert.equal(personParts('John S'), null);
  assert.equal(personParts('John'), null);
});

test('a name is confirmed only when two independent sources agree', () => {
  const one = judgeCandidates(candidatesFromMention('Avery Quinn', { category: 'site', role: 'owner', url: 'https://cafe.example/about' }));
  assert.equal(one.owner_confidence, 'low');
  const two = judgeCandidates([
    ...candidatesFromMention('Avery Quinn', { category: 'site', role: 'owner', url: 'https://cafe.example/about', phone: '(512) 555-0100' }),
    ...candidatesFromMention('Avery Quinn', { category: 'maps', role: 'founder', url: 'https://maps.example/place' }),
  ]);
  assert.equal(two.owner_confidence, 'medium');
  assert.equal(two.owner_first, 'Avery');
  assert.equal(two.owner_last, 'Quinn');
  assert.equal(two.owner_phone, '5125550100');
  assert.equal(two.owner_phone_source, 'site');
  assert.deepEqual(two.owner_sources.sort(), ['maps', 'site']);
  const three = judgeCandidates([
    ...candidatesFromMention('Avery Quinn', { category: 'site', role: 'owner' }),
    ...candidatesFromMention('Avery Quinn', { category: 'press', role: 'owner' }),
    ...candidatesFromMention('Avery Quinn', { category: 'filings_linkedin', role: 'managing partner' }),
  ]);
  assert.equal(three.owner_confidence, 'high');
  assert.equal(judgeCandidates([{ name: 'Jamie Morgan', category: 'supplied' }]).owner_name, null);
  assert.deepEqual(candidatesFromMention('Sam Chef', { category: 'site', role: 'executive chef' }), []);
  assert.equal(candidatesFromMention('Sam Owner', { category: 'site', role: 'owner and chef' }).length, 1);
});

test('role inboxes and freemail are not founder emails', () => {
  const person = personParts('John Smith');
  assert.equal(inboxKind('hello@cafe.example'), 'role');
  assert.equal(inboxKind('info@cafe.example'), 'role');
  assert.equal(inboxKind('john@gmail.com'), 'freemail');
  assert.equal(inboxKind('john@me.com'), 'freemail');
  assert.equal(inboxKind('john.smith@cafe.example'), 'possible');
  assert.equal(emailMatchesOwner('john.smith@cafe.example', person), true);
  assert.equal(emailMatchesOwner('jsmith@cafe.example', person), true);
  assert.equal(emailMatchesOwner('hello@cafe.example', person), false);
  assert.equal(emailMatchesOwner('john@gmail.com', person), true);
});

test('unconfirmed owners spend no finder or verifier credits', async () => {
  let called = false;
  const result = await enrichLead({
    owner_name: 'John Smith',
    owner_confidence: 'low',
    domain: 'cafe.example',
    website_emails: ['john.smith@cafe.example', 'hello@cafe.example'],
  }, {
    anymailPerson: async () => { called = true; return { email: 'john.smith@cafe.example' }; },
    verifyEmail: async () => { called = true; return { result: 'ok' }; },
    fullEnrich: async () => { called = true; return {}; },
    prospeo: async () => { called = true; return {}; },
  });
  assert.equal(called, false);
  assert.equal(result.skipped_finders, true);
  assert.equal(result.enriched, false);
  assert.equal(result.email, null);
  assert.ok(result.flagged_emails.every(item => item.reason === 'unconfirmed_owner'));
});

test('confirmed owners keep looking past role, freemail, and catch-all results', async () => {
  const seen = [];
  const verified = [];
  const result = await enrichLead({
    owner_name: 'John Michael Smith; Jane Doe',
    owner_confidence: 'medium',
    domain: 'cafe.example',
    website_emails: ['hello@cafe.example', 'john.smith@cafe.example'],
  }, {
    anymailPerson: async person => {
      seen.push(`anymail:${person.full}`);
      return { email: person.first === 'John' ? 'john@gmail.com' : null, calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] };
    },
    fullEnrich: async person => {
      seen.push(`fullenrich:${person.full}`);
      return {
        work: person.first === 'Jane' ? 'jane.doe@cafe.example' : 'catch@cafe.example',
        personal: null,
        calls: [{ finder: 'fullenrich', stage: 'email', credits: 1 }],
      };
    },
    prospeo: null,
    verifyEmail: async email => {
      verified.push(email);
      return { result: email.startsWith('john.smith') || email.startsWith('catch') ? 'catch_all' : 'ok', calls: [{ finder: 'millionverifier', stage: 'email', credits: 1 }] };
    },
  });
  assert.deepEqual(seen, ['anymail:John Smith', 'anymail:Jane Doe', 'fullenrich:John Smith', 'fullenrich:Jane Doe']);
  assert.equal(verified.includes('hello@cafe.example'), false);
  assert.equal(verified.includes('john@gmail.com'), false);
  assert.equal(result.email, 'jane.doe@cafe.example');
  assert.equal(result.inbox_type, 'personal');
  assert.equal(result.enriched, true);
  assert.equal(result.email_owner, 'Jane Doe');
  assert.ok(result.flagged_emails.some(item => item.email === 'hello@cafe.example' && item.reason === 'role'));
  assert.ok(result.flagged_emails.some(item => item.email === 'john@gmail.com' && item.reason === 'freemail'));
  assert.ok(result.flagged_emails.some(item => item.reason === 'catch_all'));
});

test('an owner-matching website email that verifies stops before Anymail', async () => {
  let anymail = 0;
  const result = await enrichLead({
    owner_name: 'John Michael Smith',
    owner_confidence: 'high',
    domain: 'cafe.example',
    website_emails: ['john.smith@cafe.example'],
  }, {
    anymailPerson: async person => { anymail += 1; return { email: `${person.full}@cafe.example` }; },
    verifyEmail: async () => ({ result: 'ok' }),
    prospeo: async () => { throw new Error('prospeo should not run'); },
    fullEnrich: async () => { throw new Error('fullenrich should not run'); },
  });
  assert.equal(anymail, 0);
  assert.equal(result.email, 'john.smith@cafe.example');
  assert.equal(result.email_source, 'website_email');
});

test('Prospeo stays off when no client is configured', async () => {
  let prospeo = 0;
  const result = await enrichLead({
    owner_name: 'John Smith',
    owner_confidence: 'medium',
    domain: 'cafe.example',
  }, {
    anymailPerson: async () => ({ email: null, calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] }),
    fullEnrich: async () => ({ work: null, personal: null, calls: [{ finder: 'fullenrich', stage: 'email', credits: 1 }] }),
    prospeo: null,
    verifyEmail: async () => ({ result: 'ok' }),
  });
  assert.equal(prospeo, 0);
  assert.equal(result.email, null);
  assert.equal(result.enriched, false);
  assert.equal((result.enrichment_calls || []).some(call => /perplexity|serpapi|google/i.test(call.finder)), false);
});

test('name search stops once two sources agree', async () => {
  let later = 0;
  const found = await identifyOwner({ business_name: 'Cafe', city: 'Austin', phone: '5125550199' }, {
    readSite: async () => ({ candidates: candidatesFromMention('Avery Quinn', { category: 'site', role: 'owner', url: 'https://cafe.example/about', phone: '512-555-0100' }), emails: ['hello@cafe.example'], calls: [{ finder: 'claude_haiku_site', credits: 1 }] }),
    mapsPlace: async () => ({ candidates: candidatesFromMention('Avery Quinn', { category: 'maps', role: 'owner' }), business_phone: '5125550199', calls: [{ finder: 'serpapi_maps_place', credits: 1 }] }),
    press: async () => { later += 1; return { candidates: [] }; },
    filings: async () => { later += 1; return { candidates: [] }; },
    perplexity: async () => { later += 1; return { candidates: [] }; },
  });
  assert.equal(later, 0);
  assert.equal(found.owner_confidence, 'medium');
  assert.equal(found.owner_phone, '5125550100');
  assert.equal(found.owner_phone_source, 'site');
  assert.deepEqual(found.website_emails, ['hello@cafe.example']);
});

function pipelineDeps(overrides = {}) {
  return {
    store: memoryStore(),
    dryRun: true,
    filterOne: async biz => ({ ...biz, is_franchise: false, franchise_check: 'clear' }),
    discoverOne: async biz => ({
      ...biz,
      owner_name: 'Avery Quinn',
      owner_first: 'Avery',
      owner_last: 'Quinn',
      owner_role: 'owner',
      owner_confidence: 'medium',
      owner_sources: ['site', 'maps'],
      owner_source_urls: ['https://cafe.example/about', 'https://maps.example/place'],
      owner_phone: '5125550100',
      owner_phone_source: 'site',
      website_emails: ['hello@cafe.example'],
      signal: 'Saturday counter shift',
      website_excerpt: 'The owner still works Saturdays.',
      discover_calls: [],
    }),
    enrichOne: async biz => enrichLead(biz, {
      anymailPerson: async person => ({ email: `${person.first}.${person.last}@${biz.domain}`.toLowerCase(), calls: [{ finder: 'anymail_person', stage: 'email', credits: 0 }] }),
      fullEnrich: async () => ({ work: null, personal: null, calls: [] }),
      prospeo: null,
      verifyEmail: async () => ({ result: 'ok', calls: [] }),
    }),
    draftIcebreaker: async () => ({ email1: { subject: 'a note', body: 'Draft only.' }, email2: { subject: 'follow up', body: 'Still a draft.' }, sent: false }),
    ...overrides,
  };
}

test('the same domain is enriched once', async () => {
  let enrichments = 0;
  const deps = pipelineDeps({
    enrichOne: async biz => {
      enrichments += 1;
      return enrichLead(biz, {
        anymailPerson: async () => ({ email: `avery.quinn@${biz.domain}`, calls: [] }),
        verifyEmail: async () => ({ result: 'ok' }),
      });
    },
  });
  const out = await runGenesis({
    businesses: [
      { business_name: 'Cafe One', website: 'https://cafe.example', city: 'Austin' },
      { business_name: 'Cafe Two', website: 'https://www.cafe.example', city: 'Dallas' },
    ],
  }, deps);
  assert.equal(enrichments, 1);
  assert.equal(out.leads.filter(lead => lead.deduped).length, 1);
});

test('a franchise never reaches owner discovery', async () => {
  let discovered = 0;
  const out = await runGenesis({
    businesses: [{ business_name: 'National Chain', website: 'https://chain.example', city: 'Austin' }],
  }, pipelineDeps({
    filterOne: async biz => ({ ...biz, is_franchise: true, franchise_check: 'keyword_match' }),
    discoverOne: async () => { discovered += 1; return {}; },
  }));
  assert.equal(discovered, 0);
  assert.equal(out.leads[0].status, 'No Match');
  assert.equal(out.leads[0].hold_reason, 'franchise');
});

test('low confidence stays Needs Founder and skips finders and the icebreaker', async () => {
  let enriched = 0;
  let drafted = 0;
  const out = await runGenesis({
    businesses: [{ record_id: 'FM-000001', business_name: 'Quiet Shop', domain: 'quiet.example', city: 'Austin', owner_name: 'Jamie Morgan' }],
  }, pipelineDeps({
    discoverOne: async biz => ({ ...biz, owner_name: 'Jamie Morgan', owner_first: 'Jamie', owner_last: 'Morgan', owner_confidence: 'low', owner_sources: ['site'], owner_source_urls: ['https://quiet.example/about'], website_emails: ['hello@quiet.example'], discover_calls: [] }),
    enrichOne: async () => { enriched += 1; throw new Error('finders must not run'); },
    draftIcebreaker: async () => { drafted += 1; return { sent: true }; },
  }));
  assert.equal(enriched, 0);
  assert.equal(drafted, 0);
  assert.equal(out.leads[0].status, 'Needs Founder');
  assert.equal(out.leads[0].external_id, 'FM-000001');
  assert.equal(out.leads[0].email, null);
  assert.equal(out.leads[0].icebreaker, null);
  assert.equal(out.summary.needs_founder, 1);
  assert.equal(out.summary.enriched, 0);
});

test('a confirmed personal email is Enriched and the draft is not sent', async () => {
  const out = await runGenesis({
    businesses: [{ record_id: 'FM-000001', business_name: 'Dry Run Coffee', website: 'https://dryrun.example', city: 'Austin' }],
  }, pipelineDeps());
  const lead = out.leads[0];
  assert.equal(lead.status, 'Enriched');
  assert.equal(lead.email, 'avery.quinn@dryrun.example');
  assert.equal(lead.inbox_type, 'personal');
  assert.equal(lead.verification, 'ok');
  assert.equal(lead.icebreaker_sent, false);
  assert.equal(lead.icebreaker.email1.body, 'Draft only.');
  assert.equal(out.sent, false);
  assert.ok(lead.flagged_emails.some(item => item.reason === 'role'));
  assert.equal(out.summary.founder_verified, 1);
  assert.equal(out.summary.enriched, 1);
});

test('dry run returns a personal email and writes nothing outside memory', async () => {
  const out = await runGenesis({ city: 'Austin', industry: 'Food & Beverage', dry_run: true }, dryRunDependencies());
  assert.equal(out.dry_run, true);
  assert.equal(out.sent, false);
  assert.equal(out.leads[0].status, 'Enriched');
  assert.equal(out.leads[0].owner_confidence, 'medium');
  assert.equal(out.leads[0].icebreaker_sent, false);
  assert.equal(out.leads[0].email, 'avery.quinn@dryrun.example');
  assert.ok(out.leads[0].flagged_emails.some(item => item.email === 'hello@dryrun.example'));
});

test('verification rejects win over catch-all and a missing backup leaves the primary result', () => {
  assert.equal(combineVerification('ok', null), 'ok');
  assert.equal(combineVerification('ok', 'reject'), 'reject');
  assert.equal(combineVerification('reject', 'ok'), 'reject');
  assert.equal(combineVerification('ok', 'catch_all'), 'catch_all');
  assert.equal(combineVerification('unchecked', 'ok'), 'ok');
  assert.equal(combineVerification(undefined, undefined), 'unchecked');
});

test('pipeline auth fails closed unless a session, internal call, or matching bearer is present', () => {
  assert.equal(pipelineAuthorized({}), false);
  assert.equal(pipelineAuthorized({ session: { user: { email: 'steve@example.com' } } }), true);
  assert.equal(pipelineAuthorized({ internal: true }), true);
  assert.equal(pipelineAuthorized({ authorization: 'Bearer cron-secret', cronSecret: 'cron-secret' }), true);
  assert.equal(pipelineAuthorized({ authorization: 'Bearer pipe-secret', cronSecret: 'cron-secret', pipelineSecret: 'pipe-secret' }), true);
  assert.equal(pipelineAuthorized({ authorization: 'Bearer short', cronSecret: 'a-much-longer-secret' }), false);
  assert.equal(pipelineAuthorized({ authorization: 'Bearer nope', cronSecret: 'cron-secret', pipelineSecret: 'pipe-secret' }), false);
});

test('csv export separates personal emails and neutralizes spreadsheet formulas', () => {
  const stats = pipelineStats([
    { status: 'Enriched', stage: 'done', inbox_type: 'personal', verification: 'ok', email_source: 'anymail_person', calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }], flagged_emails: [{ email: 'hello@cafe.example', reason: 'role' }] },
    { status: 'No Match', stage: 'done', inbox_type: null, email_source: null, calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }, { finder: 'serpapi_press', stage: 'name', credits: 1 }], flagged_emails: [{ email: 'owner@gmail.com', reason: 'freemail' }, { email: 'a@cafe.example', reason: 'catch_all' }] },
  ]);
  assert.equal(stats.founder_verified, 1);
  assert.equal(stats.personal_hit_rate, 50);
  assert.equal(stats.funnel.role_inboxes, 2);
  assert.equal(stats.funnel.catch_all, 1);
  assert.equal(stats.finder_credits, 2);
  assert.equal(stats.name_credits, 1);
  const anymail = stats.finders.find(finder => finder.finder === 'anymail_person');
  assert.equal(anymail.hits, 1);
  assert.equal(anymail.hit_rate, 50);
  const csv = leadsToCsv([{
    external_id: 'FM-000001',
    business_name: '=HYPERLINK("http://evil")',
    email: 'a"b@cafe.example',
    owner_first: '+15125550100',
    owner_sources: ['site', 'maps'],
    flagged_emails: [{ email: 'hello@cafe.example', reason: 'role' }],
    icebreaker: { email1: { subject: '@hello', body: 'line one\nline two' }, email2: { subject: '-follow', body: 'x' } },
    credits: 2,
  }]);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"a""b@cafe\.example"/);
  assert.match(csv, /'\+15125550100/);
  assert.match(csv, /'@hello/);
  assert.match(csv, /'-follow/);
  assert.match(csv, /site\|maps/);
  assert.doesNotMatch(csv, /^=/);
});

test('the genesis path does not import outreach or Smartlead, and paid routes require auth', () => {
  for (const file of ['pages/api/pipeline/genesis.js', 'lib/pipeline/genesisRun.mjs', 'lib/pipeline/icebreaker.js']) {
    assert.doesNotMatch(source(file), /outreach|smartlead/i, file);
  }
  const runner = source('lib/pipeline/runGenesis.js');
  assert.doesNotMatch(runner, /outreach/i);
  assert.doesNotMatch(runner, /smartlead\.com|SMARTLEAD/);
  assert.match(runner, /smartlead_status: 'draft_only'/);
  const orchestrator = source('lib/scout/orchestrator.js');
  assert.doesNotMatch(orchestrator, /pipeline\/outreach|outreachHandler/);
  assert.match(orchestrator, /executeGenesis/);
  assert.match(orchestrator, /Nothing was sent/);
  for (const file of [
    'pages/api/pipeline/scout.js',
    'pages/api/pipeline/discover.js',
    'pages/api/pipeline/enrich.js',
    'pages/api/pipeline/filter.js',
    'pages/api/pipeline/genesis.js',
    'pages/api/pipeline/find-mobile.js',
    'pages/api/pipeline/runs.js',
    'pages/api/pipeline/dedup-check.js',
    'pages/api/pipeline/debug-scout.js',
    'pages/api/pipeline/scout-debug.js',
    'pages/api/pipeline/test-anymail.js',
    'pages/api/pipeline/test-places.js',
    'pages/api/pipeline/outreach.js',
    'pages/api/dashboard/genesis-pipeline.js',
  ]) {
    assert.match(source(file), /requirePipelineAccess/, file);
  }
  assert.doesNotMatch(source('pages/api/pipeline/enrich.js'), /perplexity|serpapi/i);
  assert.doesNotMatch(source('pages/api/pipeline/discover.js'), /findOwnerViaSearch/);
});
