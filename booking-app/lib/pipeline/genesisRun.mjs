import { brandKey, domainOf, parseOwnerNames, personParts } from './ownerNames.mjs';
import { enrichLead, sumCredits } from './genesisEnrich.mjs';

const RETRYABLE = new Set(['Error', 'Pending', 'Enriching']);

function fail(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

export function normalizeGenesisRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('JSON object required');
  const dry_run = body.dry_run === true || body.dryRun === true;
  const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim().slice(0, 40) : (dry_run ? 'dry_run' : 'manual');
  if (Array.isArray(body.businesses)) {
    if (!body.businesses.length) fail('businesses must not be empty');
    if (body.businesses.length > 25) fail('Send at most 25 businesses per run');
    return { mode: 'list', dry_run, source, businesses: body.businesses };
  }
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const industry = typeof body.industry === 'string' ? body.industry.trim() : '';
  if (!city || !industry) fail('Provide {city, industry} or {businesses:[...]}');
  const requested = Number(body.limit);
  const limit = Math.min(10, Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : 5));
  return { mode: 'maps', dry_run, source, city: city.slice(0, 120), industry: industry.slice(0, 120), limit };
}

export function normalizeBusiness(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Each business must be an object');
  const business_name = String(raw.business_name || raw.name || '').trim();
  if (!business_name) fail('business_name is required');
  const website = raw.website || raw.url || null;
  const domain = domainOf(raw.domain || website);
  const city = raw.city || defaults.city || null;
  const external = raw.external_id || raw.record_id || raw.recordId || null;
  return {
    external_id: external ? String(external).trim().slice(0, 64) : null,
    business_name: business_name.slice(0, 200),
    brand_key: brandKey(business_name),
    city: city ? String(city).slice(0, 120) : null,
    city_key: String(city || '').toLowerCase().trim(),
    industry: raw.industry || defaults.industry || null,
    website: website || (domain ? `https://${domain}` : null),
    domain,
    owner_name: raw.owner_name || raw.owner || null,
    phone: raw.phone || null,
    rating: raw.rating ?? null,
    review_count: raw.review_count ?? null,
    address: raw.address || null,
    place_id: raw.place_id || null,
    signal: raw.signal || null,
    website_excerpt: raw.website_excerpt || null,
    website_emails: Array.isArray(raw.website_emails) ? raw.website_emails : null,
    website_email: raw.website_email || null,
    scout_candidate_id: raw.scout_candidate_id || null,
    source: defaults.source || 'manual',
    dry_run: !!defaults.dry_run,
  };
}

export function sameLead(a, b) {
  if (!!a.dry_run !== !!b.dry_run) return false;
  if (a.external_id && b.external_id && String(a.external_id) === String(b.external_id)) return true;
  if (a.domain && b.domain && String(a.domain).toLowerCase() === String(b.domain).toLowerCase()) return true;
  if (a.brand_key && a.brand_key === b.brand_key && (a.city_key || '') === (b.city_key || '')) return true;
  return false;
}

export function memoryStore() {
  const rows = [];
  let seq = 0;
  return {
    rows,
    async claim(lead) {
      const existing = rows.find(row => sameLead(row, lead));
      if (existing && !RETRYABLE.has(existing.status)) return { duplicate: true, row: { ...existing } };
      if (existing) {
        Object.assign(existing, {
          status: 'Pending', stage: 'pending', error: null, updated_at: new Date().toISOString(),
        });
        return { duplicate: false, row: { ...existing }, retried: true };
      }
      const row = {
        id: `mem-${++seq}`,
        ...lead,
        stage: 'pending',
        status: 'Pending',
        email: null,
        icebreaker: null,
        icebreaker_sent: false,
        credits: 0,
        calls: [],
        stage_log: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      rows.push(row);
      return { duplicate: false, row: { ...row } };
    },
    async update(id, patch) {
      const row = rows.find(item => item.id === id);
      if (!row) throw new Error(`Lead ${id} was not claimed`);
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return { ...row };
    },
  };
}

function dryPerson(biz) {
  const provided = parseOwnerNames(biz.owner_name).map(personParts).find(Boolean);
  if (provided) return provided;
  return personParts('Avery Quinn');
}

export function dryRunDependencies() {
  const store = memoryStore();
  return {
    store,
    dryRun: true,
    scoutMaps: async ({ city, industry, limit }) => ({
      businesses: [{
        business_name: 'Dry Run Coffee',
        city,
        industry,
        website: 'https://dryrun.example',
        domain: 'dryrun.example',
        rating: 4.8,
        review_count: 120,
        owner_name: null,
      }].slice(0, limit || 1),
      calls: [{ finder: 'serpapi_maps', credits: 0 }],
    }),
    filterOne: async biz => ({ ...biz, is_franchise: false, franchise_check: 'dry_run' }),
    discoverOne: async biz => {
      const person = dryPerson(biz);
      return {
        ...biz,
        owner_name: person.full,
        owner_first: person.first,
        owner_last: person.last,
        owner_role: 'owner',
        owner_confidence: 'medium',
        owner_sources: ['site', 'maps'],
        owner_source_urls: ['https://dryrun.example/about'],
        owner_source: 'site',
        owner_phone: '5125550100',
        owner_phone_source: 'site',
        signal: biz.signal || 'A neighborhood shop with a steady weekend line.',
        website_excerpt: biz.website_excerpt || 'The owner still works the counter on Saturday mornings.',
        website_emails: biz.website_emails || ['hello@dryrun.example'],
        discover_calls: [],
      };
    },
    enrichOne: async biz => enrichLead(biz, {
      anymailPerson: async (person, domain) => ({
        email: `${person.first}.${person.last}@${domain}`.toLowerCase().replace(/[^a-z.@]/g, ''),
        calls: [{ finder: 'anymail_person', stage: 'email', credits: 0 }],
      }),
      fullEnrich: async () => ({ work: null, personal: null, calls: [] }),
      prospeo: null,
      verifyEmail: async () => ({ result: 'ok', primary: 'ok', backup: null, backupSource: null, calls: [{ finder: 'millionverifier', stage: 'email', credits: 0 }] }),
    }),
    draftIcebreaker: async biz => ({
      email1: {
        subject: `a note on ${biz.business_name}`.toLowerCase(),
        body: `${personParts(biz.owner_name || biz.email_owner)?.first || 'Hello'},\n\nThis is a draft pulled from the public site. It has not been sent.\n\nWant me to send it over?`,
      },
      email2: {
        subject: `the ${biz.business_name} research`.toLowerCase(),
        body: 'Following up on the draft research.\n\nHappy to send you a copy — want it?',
      },
      sent: false,
    }),
  };
}

function logStage(log, stage, extra = {}) {
  return [...(log || []), { stage, at: new Date().toISOString(), ...extra }];
}

function ownerFound(ownerName) {
  return parseOwnerNames(ownerName).some(name => personParts(name));
}

export function summarizeLeads(leads, extraCredits = 0) {
  const fresh = leads.filter(lead => !lead.deduped);
  const byFinder = {};
  const bump = (finder, field, amount = 1) => {
    if (!finder) return;
    byFinder[finder] = byFinder[finder] || { calls: 0, hits: 0, credits: 0 };
    byFinder[finder][field] += amount;
  };
  for (const lead of fresh) {
    for (const call of lead.calls || []) bump(call.finder, 'calls', 1), bump(call.finder, 'credits', Number(call.credits) || 0);
    if (lead.inbox_type === 'personal' && lead.verification === 'ok' && lead.email_source) bump(lead.email_source, 'hits', 1);
  }
  const credits = extraCredits + fresh.reduce((total, lead) => total + (Number(lead.credits) || 0), 0);
  return {
    total: leads.length,
    deduped: leads.filter(lead => lead.deduped).length,
    enriched: fresh.filter(lead => lead.status === 'Enriched').length,
    founder_verified: fresh.filter(lead => lead.inbox_type === 'personal' && lead.verification === 'ok').length,
    flagged_not_founder: fresh.reduce((total, lead) => total + (lead.flagged_emails || []).filter(item => item.reason !== 'domain_mismatch').length, 0),
    role_inboxes: fresh.reduce((total, lead) => total + (lead.flagged_emails || []).filter(item => item.reason === 'role' || item.reason === 'freemail').length, 0),
    domain_mismatch: fresh.reduce((total, lead) => total + (lead.flagged_emails || []).filter(item => item.reason === 'domain_mismatch').length, 0),
    needs_founder: fresh.filter(lead => lead.status === 'Needs Founder').length,
    no_match: fresh.filter(lead => lead.status === 'No Match').length,
    errors: fresh.filter(lead => lead.status === 'Error').length,
    drafts: fresh.filter(lead => lead.icebreaker?.email1?.body && lead.icebreaker_sent !== true).length,
    credits,
    by_finder: byFinder,
  };
}

export async function runGenesis(input, deps) {
  const parsed = input.mode ? input : normalizeGenesisRequest(input);
  const dryRun = !!parsed.dry_run;
  let businesses = parsed.businesses || [];
  let mapsCalls = [];
  if (parsed.mode === 'maps') {
    const scout = await deps.scoutMaps({ city: parsed.city, industry: parsed.industry, limit: parsed.limit });
    businesses = scout.businesses || [];
    mapsCalls = dryRun ? [] : (scout.calls || [{ finder: 'serpapi_maps', credits: 2 }]);
  }

  const leads = [];
  for (let index = 0; index < businesses.length; index++) {
    let claimedId = null;
    try {
      const biz = normalizeBusiness(businesses[index], {
        city: parsed.city,
        industry: parsed.industry,
        source: parsed.source,
        dry_run: dryRun,
      });
      const claimed = await deps.store.claim(biz);
      if (claimed.duplicate) {
        leads.push({ ...claimed.row, deduped: true });
        continue;
      }
      claimedId = claimed.row.id;
      let stageLog = logStage([], 'claimed');
      let calls = index === 0 ? [...mapsCalls] : [];

      const filtered = await deps.filterOne(biz);
      stageLog = logStage(stageLog, 'filter', { passed: !filtered.is_franchise, check: filtered.franchise_check || null });
      if (filtered.is_franchise) {
        leads.push(await deps.store.update(claimedId, {
          stage: 'filter',
          status: 'No Match',
          hold_reason: 'franchise',
          franchise_check: filtered.franchise_check || 'franchise',
          stage_log: stageLog,
          calls,
          credits: sumCredits(calls),
          lookup_at: new Date().toISOString(),
          icebreaker_sent: false,
        }));
        continue;
      }

      await deps.store.update(claimedId, { stage: 'discover', status: 'Enriching', stage_log: stageLog });
      const discovered = await deps.discoverOne({ ...biz, ...filtered, is_franchise: false });
      const ownerName = discovered.owner_name || null;
      const confirmed = discovered.owner_confidence === 'medium' || discovered.owner_confidence === 'high';
      calls = calls.concat(discovered.discover_calls || []);
      stageLog = logStage(stageLog, 'discover', { owner: ownerName, confidence: discovered.owner_confidence || 'low', sources: discovered.owner_sources || [] });
      await deps.store.update(claimedId, {
        stage: 'discover',
        status: confirmed ? 'Enriching' : 'Needs Founder',
        owner_name: ownerName,
        owner_first: discovered.owner_first || null,
        owner_last: discovered.owner_last || null,
        owner_role: discovered.owner_role || null,
        owner_confidence: discovered.owner_confidence || 'low',
        owner_sources: discovered.owner_sources || [],
        owner_source_urls: discovered.owner_source_urls || [],
        owner_source: discovered.owner_source || null,
        owner_phone: discovered.owner_phone || null,
        owner_phone_source: discovered.owner_phone_source || null,
        business_phone: discovered.business_phone || biz.phone || null,
        signal: discovered.signal || null,
        website_excerpt: discovered.website_excerpt || null,
        website: discovered.website || biz.website,
        domain: discovered.domain || biz.domain,
        stage_log: stageLog,
        calls,
        credits: sumCredits(calls),
      });

      const enriched = confirmed
        ? await deps.enrichOne({
          ...biz,
          ...discovered,
          owner_name: ownerName,
          domain: discovered.domain || biz.domain,
          website_emails: discovered.website_emails || biz.website_emails,
          website_email: discovered.website_email || biz.website_email,
        })
        : { email: null, inbox_type: null, email_source: 'not_found', verification: null, verification_detail: {}, hold_reason: 'needs_founder', enrichment_calls: [], flagged_emails: (discovered.website_emails || []).map(email => ({ email, reason: 'unconfirmed_owner', source: 'website_email' })), skipped_finders: true };
      calls = calls.concat(enriched.enrichment_calls || []);
      stageLog = logStage(stageLog, 'enrich', {
        email_source: enriched.email_source || null,
        inbox_type: enriched.inbox_type || null,
        verification: enriched.verification || null,
      });

      let status = 'No Match';
      if (!confirmed) status = 'Needs Founder';
      else if (enriched.inbox_type === 'personal' && enriched.verification === 'ok' && enriched.email) status = 'Enriched';

      let icebreaker = null;
      if (status === 'Needs Founder') {
        stageLog = logStage(stageLog, 'icebreaker_skipped');
      } else try {
        const draft = await deps.draftIcebreaker({
          ...enriched,
          owner_name: ownerName,
          email_owner: enriched.email_owner || ownerName,
          signal: discovered.signal || biz.signal,
          website_excerpt: discovered.website_excerpt || biz.website_excerpt,
          website: discovered.website || biz.website,
        });
        if (draft?.sent === true) throw new Error('Icebreaker drafts must not be sent');
        if (draft?.email1 || draft?.email2) {
          icebreaker = { email1: draft.email1 || null, email2: draft.email2 || null, sent: false };
          if (!dryRun) calls = calls.concat([{ finder: 'anthropic_icebreaker', credits: 1 }]);
        }
        stageLog = logStage(stageLog, 'icebreaker_done', { drafted: !!icebreaker });
      } catch (error) {
        stageLog = logStage(stageLog, 'icebreaker_error', { message: error.message });
      }

      leads.push(await deps.store.update(claimedId, {
        stage: 'done',
        status,
        owner_name: ownerName,
        owner_first: discovered.owner_first || null,
        owner_last: discovered.owner_last || null,
        owner_role: discovered.owner_role || null,
        owner_confidence: discovered.owner_confidence || 'low',
        owner_sources: discovered.owner_sources || [],
        owner_source_urls: discovered.owner_source_urls || [],
        owner_phone: discovered.owner_phone || null,
        owner_phone_source: discovered.owner_phone_source || null,
        business_phone: discovered.business_phone || biz.phone || null,
        email: status === 'Enriched' ? enriched.email : null,
        inbox_type: status === 'Enriched' ? 'personal' : null,
        email_source: status === 'Enriched' ? enriched.email_source : null,
        verification: status === 'Enriched' ? enriched.verification : null,
        verification_detail: enriched.verification_detail || {},
        flagged_emails: enriched.flagged_emails || [],
        hold_reason: status === 'Enriched' ? null : (enriched.hold_reason || (confirmed ? 'no_personal_email' : 'needs_founder')),
        signal: discovered.signal || null,
        website_excerpt: discovered.website_excerpt || null,
        icebreaker,
        icebreaker_sent: false,
        calls,
        credits: sumCredits(calls),
        stage_log: stageLog,
        lookup_at: new Date().toISOString(),
        error: null,
      }));
    } catch (error) {
      if (!claimedId) {
        leads.push({
          status: 'Error',
          stage: 'error',
          error: error.message,
          business_name: businesses[index]?.business_name || null,
          deduped: false,
        });
        continue;
      }
      try {
        leads.push(await deps.store.update(claimedId, {
          stage: 'error',
          status: 'Error',
          error: error.message,
          icebreaker_sent: false,
          lookup_at: new Date().toISOString(),
        }));
      } catch (updateError) {
        leads.push({ id: claimedId, status: 'Error', stage: 'error', error: `${error.message}; ${updateError.message}` });
      }
    }
  }

  const summary = summarizeLeads(leads);
  return {
    dry_run: dryRun,
    source: parsed.source,
    city: parsed.city || null,
    industry: parsed.industry || null,
    summary,
    leads,
    sent: false,
  };
}
