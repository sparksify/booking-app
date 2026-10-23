import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOwnerNames, personParts } from '../lib/pipeline/ownerNames.mjs';
import { candidatesFromMention, domainsAlign, emailMatchesBusiness, emailMatchesOwner, inboxKind, judgeCandidates, mapsListingText, reviewSnippets } from '../lib/pipeline/ownerGate.mjs';
import { classifierConfirmsFranchise, franchiseOverrideReason, pageFranchiseEvidence, recordedFranchiseCheck, retryDespiteTerminal, sameFranchise } from '../lib/pipeline/franchiseGate.mjs';
import { enrichLead, leadStatusForContact } from '../lib/pipeline/genesisEnrich.mjs';
import { dryRunDependencies, memoryStore, runGenesis } from '../lib/pipeline/genesisRun.mjs';
import { identifyOwner } from '../lib/pipeline/identifyOwner.mjs';
import { combineVerification } from '../lib/pipeline/verifyDecision.mjs';
import { pipelineAuthorized } from '../lib/pipeline/authDecision.mjs';
import { franchisesToCsv, leadsToCsv, pipelineStats } from '../lib/pipeline/dashboardStats.mjs';

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
  assert.equal(inboxKind('hola@cafe.example'), 'role');
  assert.equal(inboxKind('contact@cafe.example'), 'role');
  assert.equal(inboxKind('eat@cafe.example'), 'role');
  assert.equal(inboxKind('hola@gmail.com'), 'role');
  assert.equal(inboxKind('john@gmail.com'), 'freemail');
  assert.equal(inboxKind('john@me.com'), 'freemail');
  assert.equal(inboxKind('john@yahoo.com'), 'freemail');
  assert.equal(inboxKind('john@hotmail.com'), 'freemail');
  assert.equal(inboxKind('john@icloud.com'), 'freemail');
  assert.equal(inboxKind('john.smith@cafe.example'), 'possible');
  assert.equal(emailMatchesBusiness('letstoastofficial@gmail.com', "Let's Toast"), true);
  assert.equal(emailMatchesBusiness('randomstaff@gmail.com', "Let's Toast"), false);
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
  assert.equal(verified.includes('john@gmail.com'), true);
  assert.equal(result.email, 'jane.doe@cafe.example');
  assert.equal(result.inbox_type, 'personal');
  assert.equal(result.enriched, true);
  assert.equal(result.email_owner, 'Jane Doe');
  assert.equal(result.loadable, true);
  assert.ok(result.flagged_emails.some(item => item.email === 'hello@cafe.example' && item.reason === 'role'));
  assert.ok(result.flagged_emails.some(item => item.email === 'john@gmail.com' && item.reason === 'freemail'));
  assert.ok(result.flagged_emails.some(item => item.reason === 'catch_all'));
});

test('a website freemail does not bypass the name gate or call paid finders', async () => {
  let called = false;
  const result = await enrichLead({
    business_name: "Let's Toast",
    owner_name: 'Maya Chen',
    owner_confidence: 'low',
    domain: 'letstoast.example',
    website_emails: ['letstoastofficial@gmail.com'],
  }, {
    anymailPerson: async () => { called = true; return { email: 'maya@letstoast.example' }; },
    verifyEmail: async () => { called = true; return { result: 'ok' }; },
    fullEnrich: async () => { called = true; return {}; },
    prospeo: async () => { called = true; return {}; },
  });
  assert.equal(called, false);
  assert.equal(result.email, null);
  assert.equal(result.skipped_finders, true);
  assert.equal(result.hold_reason, 'needs_founder');
  assert.equal(leadStatusForContact(false, result), 'Needs Founder');
});

test('a website freemail that carries the business name is accepted after the name gate', async () => {
  const verified = [];
  let anymail = 0;
  const result = await enrichLead({
    business_name: "Let's Toast",
    owner_name: 'Maya Chen',
    owner_first: 'Maya',
    owner_last: 'Chen',
    owner_confidence: 'medium',
    domain: 'letstoast.example',
    website_emails: ['randomstaff@gmail.com', 'letstoastofficial@gmail.com', 'hola@letstoast.example', 'eat@letstoast.example', 'contact@letstoast.example', 'hello@letstoast.example', 'info@letstoast.example'],
  }, {
    anymailPerson: async () => { anymail += 1; return { email: null, calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] }; },
    fullEnrich: async () => ({ work: null, personal: null, calls: [] }),
    prospeo: null,
    verifyEmail: async email => {
      verified.push(email);
      return { result: email.endsWith('@gmail.com') ? 'ok' : 'reject' };
    },
  });
  assert.equal(anymail, 1);
  assert.deepEqual(verified, ['letstoastofficial@gmail.com']);
  assert.equal(result.email, 'letstoastofficial@gmail.com');
  assert.equal(result.inbox_type, 'freemail');
  assert.equal(result.verification, 'ok');
  assert.equal(result.email_source, 'website_email');
  assert.equal(result.enriched, false);
  assert.equal(result.loadable, false);
  assert.equal(result.hold_reason, null);
  assert.equal(leadStatusForContact(true, result), 'Accepted Freemail');
  for (const role of ['hola@letstoast.example', 'eat@letstoast.example', 'contact@letstoast.example', 'hello@letstoast.example', 'info@letstoast.example']) {
    assert.ok(result.flagged_emails.some(item => item.email === role && item.reason === 'role'), role);
  }
  assert.ok(result.flagged_emails.some(item => item.email === 'randomstaff@gmail.com' && item.reason === 'freemail'));
  assert.equal(result.flagged_emails.some(item => item.email === 'letstoastofficial@gmail.com'), false);
});

test('a founder gmail from a finder is accepted when no business email verifies', async () => {
  let later = 0;
  const result = await enrichLead({
    owner_name: 'John Smith',
    owner_confidence: 'medium',
    domain: 'cafe.example',
  }, {
    anymailPerson: async () => ({ email: 'john@yahoo.com', calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] }),
    fullEnrich: async () => { later += 1; return { work: null, personal: 'john.smith@hotmail.com', calls: [] }; },
    prospeo: async () => { later += 1; return { email: null }; },
    verifyEmail: async () => ({ result: 'ok' }),
  });
  assert.equal(later, 2);
  assert.equal(result.email, 'john@yahoo.com');
  assert.equal(result.inbox_type, 'freemail');
  assert.equal(result.verification, 'ok');
  assert.equal(result.enriched, false);
  assert.equal(result.loadable, false);
  assert.equal(result.hold_reason, null);
});

test('a founder-matching catch-all is accepted and stays out of the verified business count', async () => {
  const verified = [];
  const result = await enrichLead({
    business_name: 'Mercado Sin Nombre',
    owner_name: 'Julian Vega',
    owner_first: 'Julian',
    owner_last: 'Vega',
    owner_confidence: 'high',
    domain: 'mercadosinnombre.com',
    website_emails: ['hola@mercadosinnombre.com', 'info@mercadosinnombre.com'],
  }, {
    anymailPerson: async () => ({ email: 'julian@mercadosinnombre.com', calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] }),
    fullEnrich: async () => ({ work: 'studio@mercadosinnombre.com', personal: null, calls: [] }),
    prospeo: null,
    verifyEmail: async email => {
      verified.push(email);
      return { result: 'catch_all' };
    },
  });
  assert.equal(verified.includes('hola@mercadosinnombre.com'), false);
  assert.equal(verified.includes('info@mercadosinnombre.com'), false);
  assert.equal(result.email, 'julian@mercadosinnombre.com');
  assert.equal(result.email_owner, 'Julian Vega');
  assert.equal(result.inbox_type, 'catch_all');
  assert.equal(result.verification, 'catch_all');
  assert.equal(result.email_source, 'anymail_person');
  assert.equal(result.enriched, false);
  assert.equal(result.loadable, false);
  assert.equal(result.hold_reason, null);
  assert.equal(result.flagged_emails.some(item => item.email === 'julian@mercadosinnombre.com'), false);
  assert.ok(result.flagged_emails.some(item => item.email === 'studio@mercadosinnombre.com' && item.reason === 'catch_all'));
  assert.equal(leadStatusForContact(true, result), 'Accepted Catch-all');
});

test('a founder catch-all on the business domain is kept ahead of freemail', async () => {
  const result = await enrichLead({
    business_name: 'Mercado Sin Nombre',
    owner_name: 'Julian Vega',
    owner_confidence: 'high',
    domain: 'mercadosinnombre.com',
    website_emails: ['julian.vega@gmail.com'],
  }, {
    anymailPerson: async () => ({ email: 'julian@mercadosinnombre.com' }),
    fullEnrich: null,
    prospeo: null,
    verifyEmail: async email => ({ result: email.endsWith('@gmail.com') ? 'ok' : 'catch_all' }),
  });
  assert.equal(result.email, 'julian@mercadosinnombre.com');
  assert.equal(result.inbox_type, 'catch_all');
  assert.equal(result.enriched, false);
  assert.ok(result.flagged_emails.some(item => item.email === 'julian.vega@gmail.com' && item.reason === 'freemail'));
});

test('a catch-all that does not match the founder stays no_personal_email', async () => {
  const result = await enrichLead({
    owner_name: 'Julian Vega',
    owner_confidence: 'high',
    domain: 'mercadosinnombre.com',
  }, {
    anymailPerson: async () => ({ email: 'studio@mercadosinnombre.com' }),
    fullEnrich: null,
    prospeo: null,
    verifyEmail: async () => ({ result: 'catch_all' }),
  });
  assert.equal(result.email, null);
  assert.equal(result.inbox_type, null);
  assert.equal(result.hold_reason, 'no_personal_email');
  assert.ok(result.flagged_emails.some(item => item.email === 'studio@mercadosinnombre.com' && item.reason === 'catch_all'));
});

test('role inboxes from a finder are rejected even when the owner name is confirmed', async () => {
  const verified = [];
  const result = await enrichLead({
    owner_name: 'Julian Vega',
    owner_confidence: 'medium',
    domain: 'mercadosinnombre.com',
  }, {
    anymailPerson: async () => ({ email: 'eat@mercadosinnombre.com' }),
    fullEnrich: async () => ({ work: 'info@mercadosinnombre.com', personal: 'hola@gmail.com' }),
    prospeo: async () => ({ email: 'contact@mercadosinnombre.com' }),
    verifyEmail: async email => { verified.push(email); return { result: 'ok' }; },
  });
  assert.deepEqual(verified, []);
  assert.equal(result.email, null);
  assert.equal(result.hold_reason, 'no_personal_email');
  assert.equal(result.enriched, false);
  for (const role of ['eat@mercadosinnombre.com', 'info@mercadosinnombre.com', 'hola@gmail.com', 'contact@mercadosinnombre.com']) {
    assert.ok(result.flagged_emails.some(item => item.email === role && item.reason === 'role'), role);
  }
});

test('an invalid founder freemail is not stored', async () => {
  const result = await enrichLead({
    owner_name: 'John Smith',
    owner_confidence: 'medium',
    domain: 'cafe.example',
    website_emails: ['john@icloud.com'],
  }, {
    anymailPerson: async () => ({ email: null }),
    fullEnrich: null,
    prospeo: null,
    verifyEmail: async () => ({ result: 'reject' }),
  });
  assert.equal(result.email, null);
  assert.equal(result.hold_reason, 'no_personal_email');
  assert.ok(result.flagged_emails.some(item => item.email === 'john@icloud.com' && item.reason === 'reject'));
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
  let enriched = 0;
  const out = await runGenesis({
    businesses: [{ record_id: 'FM-000015', business_name: 'National Chain', website: 'https://chain.example', city: 'Austin' }],
  }, pipelineDeps({
    scoutMaps: async () => { throw new Error('Maps must not run when the website is already known'); },
    filterOne: async biz => ({ ...biz, is_franchise: true, franchise_check: 'keyword_match', franchise_evidence_kind: 'page', franchise_evidence_detail: 'franchise', franchise_evidence_url: biz.website, franchise_confidence: 'high' }),
    discoverOne: async () => { discovered += 1; return {}; },
    enrichOne: async () => { enriched += 1; return {}; },
  }));
  assert.equal(discovered, 0);
  assert.equal(enriched, 0);
  assert.equal(out.leads[0].status, 'No Match');
  assert.equal(out.leads[0].hold_reason, 'franchise');
  assert.equal(out.leads[0].franchise_check, 'keyword_match');
  assert.equal(out.leads[0].credits, 0);
  assert.deepEqual(out.leads[0].calls, []);
  assert.equal(out.franchises[0].brand, 'National Chain');
  assert.equal(out.franchises[0].domain, 'chain.example');
  assert.equal(out.franchises[0].evidence_kind, 'page');
  assert.equal(out.franchises[0].external_id, 'FM-000015');
  assert.equal(out.franchises[0].confidence, 'high');
});

test('a city search still franchise-gates each business before name, finder, or verifier calls', async () => {
  const order = [];
  const out = await runGenesis({ city: 'Austin', industry: 'Food & Beverage' }, pipelineDeps({
    scoutMaps: async () => {
      order.push('maps');
      return { businesses: [{ business_name: 'Chain', website: 'https://chain.example', city: 'Austin' }], calls: [{ finder: 'serpapi_maps', stage: 'name', credits: 2 }] };
    },
    filterOne: async biz => { order.push('filter'); return { ...biz, is_franchise: true, franchise_check: 'keyword_match', franchise_evidence_kind: 'page', franchise_confidence: 'high' }; },
    discoverOne: async () => { order.push('discover'); return {}; },
    enrichOne: async () => { order.push('enrich'); return {}; },
  }));
  assert.deepEqual(order, ['maps', 'filter']);
  assert.equal(out.leads[0].credits, 0);
  assert.deepEqual(out.leads[0].calls, []);
});

test('a scout override clears a franchise hold and reruns', async () => {
  const store = memoryStore();
  let discovered = 0;
  const saved = [];
  const overrides = [];
  const deps = pipelineDeps({
    store,
    filterOne: async biz => ({ ...biz, is_franchise: true, franchise_check: 'claude_detected', franchise_evidence_kind: 'classifier', franchise_confidence: 'medium' }),
    discoverOne: async biz => { discovered += 1; return { ...biz, owner_name: 'Avery Quinn', owner_first: 'Avery', owner_last: 'Quinn', owner_role: 'owner', owner_confidence: 'medium', owner_sources: ['site', 'maps'], website_emails: [], discover_calls: [] }; },
    recordFranchise: async row => { saved.push(row); },
    recordOverride: async row => { overrides.push(row); },
  });
  const held = await runGenesis({
    businesses: [{ record_id: 'FM-000015', business_name: 'Eggroll Company', website: 'https://eggroll.example', city: 'Austin' }],
  }, deps);
  assert.equal(held.leads[0].hold_reason, 'franchise');
  assert.equal(discovered, 0);
  assert.equal(saved.length, 1);
  const rerun = await runGenesis({
    businesses: [{ record_id: 'FM-000015', business_name: 'Eggroll Company', website: 'https://eggroll.example', city: 'Austin', franchise_override: 'Scout found no franchise offering' }],
  }, deps);
  assert.equal(discovered, 1);
  assert.equal(rerun.leads[0].deduped, undefined);
  assert.equal(rerun.leads[0].status, 'Enriched');
  assert.ok(rerun.leads[0].stage_log.some(entry => entry.stage === 'franchise_override' && entry.reason === 'Scout found no franchise offering'));
  assert.equal(overrides[0].override_reason, 'Scout found no franchise offering');
  assert.equal(saved.length, 1);
  assert.equal(franchiseOverrideReason(true), 'verified non-franchise');
  assert.equal(retryDespiteTerminal({ hold_reason: 'franchise', status: 'No Match' }, { franchise_override: 'Scout found no franchise offering' }), true);
  assert.equal(retryDespiteTerminal({ hold_reason: 'franchise', status: 'No Match' }, {}), false);
  assert.equal(held.leads[0].franchise_check, 'claude_detected');
  assert.equal(rerun.leads[0].franchise_check, 'override');
  assert.equal(store.rows[0].franchise_check, 'override');
});

test('a rerun that passes the franchise check replaces the stored claude_detected value', async () => {
  const store = memoryStore();
  const deps = pipelineDeps({
    store,
    filterOne: async biz => biz.franchise_override
      ? { ...biz, is_franchise: false, franchise_check: 'claude_clear' }
      : { ...biz, is_franchise: true, franchise_check: 'claude_detected', franchise_evidence_kind: 'classifier', franchise_confidence: 'medium' },
    discoverOne: async biz => ({ ...biz, owner_name: 'Avery Quinn', owner_first: 'Avery', owner_last: 'Quinn', owner_role: 'owner', owner_confidence: 'medium', owner_sources: ['site', 'maps'], website_emails: [], discover_calls: [] }),
  });
  const held = await runGenesis({
    businesses: [{ record_id: 'FM-000015', business_name: 'Eggroll Company', website: 'https://eggroll.example', city: 'Austin' }],
  }, deps);
  assert.equal(held.leads[0].franchise_check, 'claude_detected');
  assert.equal(held.leads[0].hold_reason, 'franchise');
  const rerun = await runGenesis({
    businesses: [{ record_id: 'FM-000015', business_name: 'Eggroll Company', website: 'https://eggroll.example', city: 'Austin', franchise_override: true }],
  }, deps);
  assert.equal(rerun.leads[0].deduped, undefined);
  assert.equal(rerun.leads[0].status, 'Enriched');
  assert.equal(rerun.leads[0].hold_reason, null);
  assert.equal(rerun.leads[0].franchise_check, 'claude_clear');
  assert.equal(store.rows[0].franchise_check, 'claude_clear');
  assert.notEqual(store.rows[0].franchise_check, 'claude_detected');
  assert.equal(recordedFranchiseCheck({ is_franchise: false, franchise_check: 'claude_clear' }, 'verified non-franchise'), 'claude_clear');
  assert.equal(recordedFranchiseCheck({ is_franchise: true, franchise_check: 'claude_detected' }, 'verified non-franchise'), 'override');
  assert.equal(recordedFranchiseCheck({ is_franchise: true, franchise_check: 'claude_detected' }, null), 'claude_detected');
});

test('a dry run keeps the franchise result in memory and does not write the brand catalog', async () => {
  let saved = 0;
  let discovered = 0;
  const out = await runGenesis({
    dry_run: true,
    businesses: [{ record_id: 'FM-000015', business_name: 'National Chain', website: 'https://chain.example', city: 'Austin' }],
  }, pipelineDeps({
    filterOne: async biz => ({ ...biz, is_franchise: true, franchise_check: 'keyword_match', franchise_evidence_kind: 'page', franchise_confidence: 'high' }),
    recordFranchise: async () => { saved += 1; },
    discoverOne: async () => { discovered += 1; return {}; },
  }));
  assert.equal(saved, 0);
  assert.equal(discovered, 0);
  assert.equal(out.dry_run, true);
  assert.equal(out.leads[0].hold_reason, 'franchise');
  assert.equal(out.franchises.length, 1);
  assert.equal(out.leads[0].credits, 0);
});

test('city search credits attach only to a business that passes the franchise gate', async () => {
  const out = await runGenesis({ city: 'Austin', industry: 'Food & Beverage' }, pipelineDeps({
    scoutMaps: async () => ({
      businesses: [
        { business_name: 'Chain', website: 'https://chain.example', city: 'Austin' },
        { business_name: 'Cafe', website: 'https://cafe.example', city: 'Austin' },
      ],
      calls: [{ finder: 'serpapi_maps', stage: 'name', credits: 2 }],
    }),
    filterOne: async biz => ({
      ...biz,
      is_franchise: biz.domain === 'chain.example',
      franchise_check: biz.domain === 'chain.example' ? 'keyword_match' : 'claude_clear',
      franchise_evidence_kind: 'page',
      franchise_confidence: 'high',
    }),
  }));
  const chain = out.leads.find(lead => lead.domain === 'chain.example');
  const cafe = out.leads.find(lead => lead.domain === 'cafe.example');
  assert.equal(chain.credits, 0);
  assert.deepEqual(chain.calls, []);
  assert.ok(cafe.calls.some(call => call.finder === 'serpapi_maps' && call.credits === 2));
  assert.equal(cafe.status, 'Enriched');
  assert.equal(out.franchises.length, 1);
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
  assert.equal(out.summary.accepted_freemail, 0);
  assert.equal(out.summary.accepted_catch_all, 0);
});

test('accepted freemail is stored separately and the draft is not sent', async () => {
  const out = await runGenesis({
    businesses: [{ record_id: 'FM-000099', business_name: "Let's Toast", website: 'https://letstoast.example', city: 'Austin' }],
  }, pipelineDeps({
    discoverOne: async biz => ({
      ...biz,
      owner_name: 'Maya Chen',
      owner_first: 'Maya',
      owner_last: 'Chen',
      owner_role: 'owner',
      owner_confidence: 'medium',
      owner_sources: ['site', 'maps'],
      owner_source_urls: ['https://letstoast.example/about'],
      website_emails: ['letstoastofficial@gmail.com', 'info@letstoast.example'],
      discover_calls: [],
    }),
    enrichOne: async biz => enrichLead(biz, {
      anymailPerson: async () => ({ email: null, calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] }),
      fullEnrich: async () => ({ work: null, personal: null, calls: [] }),
      prospeo: null,
      verifyEmail: async () => ({ result: 'ok', calls: [] }),
    }),
  }));
  const lead = out.leads[0];
  assert.equal(lead.status, 'Accepted Freemail');
  assert.equal(lead.email, 'letstoastofficial@gmail.com');
  assert.equal(lead.inbox_type, 'freemail');
  assert.equal(lead.verification, 'ok');
  assert.equal(lead.hold_reason, null);
  assert.equal(lead.icebreaker_sent, false);
  assert.equal(lead.icebreaker.email1.body, 'Draft only.');
  assert.equal(out.sent, false);
  assert.equal(out.summary.enriched, 0);
  assert.equal(out.summary.founder_verified, 0);
  assert.equal(out.summary.accepted_freemail, 1);
  assert.equal(out.summary.accepted_catch_all, 0);
});

test('accepted catch-all is stored separately and the draft is not sent', async () => {
  const out = await runGenesis({
    businesses: [{ record_id: 'FM-000100', business_name: 'Mercado Sin Nombre', website: 'https://mercadosinnombre.com', city: 'Austin' }],
  }, pipelineDeps({
    discoverOne: async biz => ({
      ...biz,
      owner_name: 'Julian Vega',
      owner_first: 'Julian',
      owner_last: 'Vega',
      owner_role: 'owner',
      owner_confidence: 'high',
      owner_sources: ['site', 'press'],
      owner_source_urls: ['https://mercadosinnombre.com/about'],
      website_emails: ['hola@mercadosinnombre.com'],
      discover_calls: [],
    }),
    enrichOne: async biz => enrichLead(biz, {
      anymailPerson: async () => ({ email: 'julian@mercadosinnombre.com', calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] }),
      fullEnrich: null,
      prospeo: null,
      verifyEmail: async () => ({ result: 'catch_all', calls: [] }),
    }),
  }));
  const lead = out.leads[0];
  assert.equal(lead.status, 'Accepted Catch-all');
  assert.equal(lead.email, 'julian@mercadosinnombre.com');
  assert.equal(lead.inbox_type, 'catch_all');
  assert.equal(lead.verification, 'catch_all');
  assert.equal(lead.hold_reason, null);
  assert.equal(lead.icebreaker_sent, false);
  assert.equal(out.sent, false);
  assert.equal(out.summary.enriched, 0);
  assert.equal(out.summary.founder_verified, 0);
  assert.equal(out.summary.accepted_catch_all, 1);
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
  assert.equal(stats.funnel.accepted_freemail, 0);
  assert.equal(stats.funnel.accepted_catch_all, 0);
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

test('Maps review text survives object, missing, and numeric review payloads', () => {
  const text = mapsListingText({
    title: 'Cafe',
    description: 'Local shop',
    user_reviews: { most_relevant: [{ description: 'The owner is Avery.' }, { snippet: 'Saturday line.' }] },
  });
  assert.match(text, /The owner is Avery/);
  assert.match(text, /Saturday line/);
  assert.equal(mapsListingText({ user_reviews: { summary: 'A paragraph, not a list.' } }, { most_relevant: [{ text: 'From the fallback.' }] }), 'From the fallback.');
  assert.equal(reviewSnippets(undefined), '');
  assert.equal(reviewSnippets(null), '');
  assert.equal(reviewSnippets('not-an-array'), '');
  assert.equal(reviewSnippets(42), '');
  assert.equal(mapsListingText({ user_reviews: 12, reviews: 80 }), '');
  assert.doesNotMatch(source('lib/pipeline/nameSources.js'), /user_reviews[^;\n]*\.slice/);
  assert.match(source('lib/pipeline/nameSources.js'), /mapsListingText\(/);
});

test('a personal email on a different domain is flagged and still counts as Enriched', async () => {
  const result = await enrichLead({
    owner_name: 'John Smith',
    owner_confidence: 'medium',
    domain: 'cafe.example',
  }, {
    anymailPerson: async () => ({ email: 'john.smith@otherco.com', calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] }),
    verifyEmail: async () => ({ result: 'ok', calls: [] }),
    fullEnrich: null,
    prospeo: null,
  });
  assert.equal(result.enriched, true);
  assert.equal(result.email, 'john.smith@otherco.com');
  assert.equal(result.inbox_type, 'personal');
  assert.ok(result.flagged_emails.some(item => item.email === 'john.smith@otherco.com' && item.reason === 'domain_mismatch'));

  const sameOrg = await enrichLead({
    owner_name: 'John Smith',
    owner_confidence: 'high',
    domain: 'cafe.example',
    website_emails: ['john@mail.cafe.example'],
  }, {
    anymailPerson: async () => { throw new Error('Anymail should not run'); },
    verifyEmail: async () => ({ result: 'ok' }),
  });
  assert.equal(sameOrg.email, 'john@mail.cafe.example');
  assert.equal(sameOrg.enriched, true);
  assert.equal((sameOrg.flagged_emails || []).some(item => item.reason === 'domain_mismatch'), false);
  assert.equal(domainsAlign('john@cafe.example', 'cafe.example'), true);
  assert.equal(domainsAlign('john@otherco.com', 'cafe.example'), false);
  assert.equal(domainsAlign('john@cafe.example', ''), true);

  const stats = pipelineStats([{
    status: 'Enriched',
    inbox_type: 'personal',
    verification: 'ok',
    email_source: 'anymail_person',
    flagged_emails: [{ email: 'john.smith@otherco.com', reason: 'domain_mismatch' }, { email: 'hello@cafe.example', reason: 'role' }],
    calls: [],
  }]);
  assert.equal(stats.founder_verified, 1);
  assert.equal(stats.funnel.domain_mismatch, 1);
  assert.equal(stats.funnel.role_inboxes, 1);
});

test('accepted freemail and catch-all stay out of the verified business email rate', () => {
  const stats = pipelineStats([
    { status: 'Enriched', inbox_type: 'personal', verification: 'ok', email: 'avery@cafe.example', email_source: 'anymail_person', calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] },
    { status: 'Accepted Freemail', inbox_type: 'freemail', verification: 'ok', email: 'letstoastofficial@gmail.com', email_source: 'website_email', calls: [], flagged_emails: [{ email: 'info@letstoast.example', reason: 'role' }] },
    { status: 'Accepted Catch-all', inbox_type: 'catch_all', verification: 'catch_all', email: 'julian@mercadosinnombre.com', email_source: 'anymail_person', calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] },
  ]);
  assert.equal(stats.founder_verified, 1);
  assert.equal(stats.funnel.founder_emails, 1);
  assert.equal(stats.funnel.accepted_freemail, 1);
  assert.equal(stats.funnel.accepted_catch_all, 1);
  assert.equal(stats.funnel.role_inboxes, 1);
  assert.equal(stats.funnel.catch_all, 0);
  assert.equal(stats.personal_hit_rate, 33);
  const anymail = stats.finders.find(finder => finder.finder === 'anymail_person');
  assert.equal(anymail.hits, 1);
});

test('the classifier needs an FDD, franchise page, or franchising quote that is actually on the page', () => {
  const eggroll = '<html><title>Eggroll Company</title><p>Family restaurant in Austin. We are not a franchise. Start your own tradition.</p>';
  assert.equal(pageFranchiseEvidence(eggroll), null);
  assert.equal(pageFranchiseEvidence('<p>Own a business and open a location you love.</p>'), null);
  assert.equal(classifierConfirmsFranchise(eggroll, 'FRANCHISE').franchise, false);
  assert.equal(classifierConfirmsFranchise(eggroll, '{"decision":"FRANCHISE","evidence":"Franchise Disclosure Document"}').franchise, false);
  const offering = '<html><a href="/franchise">Franchise opportunities</a><p>Read our Franchise Disclosure Document.</p>';
  assert.equal(pageFranchiseEvidence(offering).kind, 'page');
  assert.equal(pageFranchiseEvidence(offering).confidence, 'high');
  const confirmed = classifierConfirmsFranchise(offering, '{"decision":"FRANCHISE","evidence":"Franchise Disclosure Document"}');
  assert.equal(confirmed.franchise, true);
  assert.match(confirmed.evidence, /Franchise Disclosure Document/);
  assert.equal(classifierConfirmsFranchise(offering, '{"decision":"INDEPENDENT","evidence":"Franchise opportunities"}').franchise, false);
  assert.equal(sameFranchise({ domain: 'Chain.example', brand_key: 'other' }, { domain: 'chain.example', brand_key: 'chain' }), true);
  assert.equal(sameFranchise({ domain: null, brand_key: 'eggroll company' }, { domain: 'other.example', brand_key: 'eggroll company' }), true);
  assert.equal(sameFranchise({ domain: 'a.example', brand_key: 'a' }, { domain: 'b.example', brand_key: 'b' }), false);
  const csv = franchisesToCsv([{ brand: '=Chain', domain: 'chain.example', evidence_detail: 'franchise', confidence: 'high' }]);
  assert.match(csv, /'=Chain/);
  const prompt = source('pages/api/pipeline/filter.js');
  assert.match(prompt, /classifierConfirmsFranchise/);
  assert.doesNotMatch(prompt, /doesn.t mention franchising directly/);
  const migration = source('supabase/migrations/20261022220000_franchise_brands.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.franchise_brands/);
  assert.match(migration, /evidence_kind IN \('classifier', 'page', 'filing'\)/);
  assert.match(migration, /franchise_brands_domain_uidx/);
  assert.match(migration, /franchise_brands_brand_uidx/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.franchise_brands FROM anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.franchise_brands TO service_role/);
  assert.doesNotMatch(migration, /create policy/i);
  assert.match(source('lib/pipeline/runGenesis.js'), /saveFranchiseBrand/);
  assert.match(source('pages/api/dashboard/genesis-pipeline.js'), /franchise_brands/);
  assert.match(source('pages/api/dashboard/genesis-pipeline.js'), /getSupabaseAdmin/);
});

test('genesis_leads stores franchise_check, locks out the anon key, and the server uses the service role', () => {
  const franchise = source('supabase/migrations/20261022204000_genesis_leads_franchise_check.sql');
  const rls = source('supabase/migrations/20261022204100_genesis_leads_rls.sql');
  assert.match(franchise, /ADD COLUMN IF NOT EXISTS franchise_check TEXT/);
  assert.match(rls, /ENABLE ROW LEVEL SECURITY/);
  assert.match(rls, /REVOKE ALL ON public\.genesis_leads FROM anon, authenticated/);
  assert.match(rls, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.genesis_leads TO service_role/);
  assert.doesNotMatch(rls, /create policy/i);
  assert.doesNotMatch(rls, /to anon|to authenticated/i);
  for (const file of ['lib/pipeline/runGenesis.js', 'lib/pipeline/genesisStore.js', 'pages/api/dashboard/genesis-pipeline.js']) {
    assert.doesNotMatch(source(file), /getSupabase\(/, file);
  }
  assert.match(source('lib/pipeline/runGenesis.js'), /getSupabaseAdmin/);
  assert.match(source('pages/api/dashboard/genesis-pipeline.js'), /getSupabaseAdmin/);
  assert.match(source('lib/supabase.js'), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source('pages/api/scout/tick.js'), /runScoutTick\(getSupabaseAdmin\(\)\)/);
  assert.match(source('lib/pipeline/genesisRun.mjs'), /franchise_check: recordedFranchiseCheck\(filtered, biz\.franchise_override\)/);
  assert.match(source('lib/pipeline/genesisRun.mjs'), /franchise_check: franchiseCheck/);
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
