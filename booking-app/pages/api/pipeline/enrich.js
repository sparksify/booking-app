export const config = { maxDuration: 290 };

import { enrichLead } from '@/lib/pipeline/genesisEnrich.mjs';
import { combineVerification } from '@/lib/pipeline/verifyDecision.mjs';
import { hasFullName } from '@/lib/pipeline/ownerNames.mjs';
import { requirePipelineAccess } from '@/lib/scout/auth';

const ANYMAIL_KEY     = process.env.ANYMAIL_FINDER_API_KEY;
const FULLENRICH_KEY  = process.env.FULLENRICH_API_KEY;
const PROSPEO_KEY     = process.env.PROSPEO_API_KEY;
const MV_KEY          = process.env.MILLIONVERIFIER_API_KEY;

export async function verifyEmail(email, { strict = false } = {}) {
  if (!email) return 'reject';
  if (!MV_KEY) return 'unchecked';
  try {
    const params = new URLSearchParams({ api: MV_KEY, email, timeout: '10' });
    const r = await fetch(`https://api.millionverifier.com/api/v3/?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return strict ? 'unchecked' : 'reject';
    const d = await r.json();
    if (d.result === 'ok')        return 'ok';
    if (d.result === 'catch_all') return 'catch_all';
    if (['invalid', 'disposable'].includes(d.result)) return 'reject';
    return strict ? 'unchecked' : 'reject';
  } catch (e) {
    return 'unchecked';
  }
}

async function backupVerify(email) {
  if (process.env.REOON_API_KEY) {
    const params = new URLSearchParams({ email, key: process.env.REOON_API_KEY, mode: 'quick' });
    const response = await fetch(`https://emailverifier.reoon.com/api/v1/verify?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { result: 'unchecked', source: 'reoon' };
    const payload = await response.json();
    const status = String(payload.status || payload.result || '').toLowerCase();
    if (['valid', 'safe', 'ok'].includes(status)) return { result: 'ok', source: 'reoon' };
    if (status.includes('catch')) return { result: 'catch_all', source: 'reoon' };
    if (['invalid', 'disposable', 'disabled', 'spamtrap', 'inbox_full'].includes(status)) return { result: 'reject', source: 'reoon' };
    return { result: 'unchecked', source: 'reoon' };
  }
  if (process.env.ZEROBOUNCE_API_KEY) {
    const params = new URLSearchParams({ api_key: process.env.ZEROBOUNCE_API_KEY, email });
    const response = await fetch(`https://api.zerobounce.net/v2/validate?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { result: 'unchecked', source: 'zerobounce' };
    const payload = await response.json();
    const status = String(payload.status || '').toLowerCase();
    if (status === 'valid') return { result: 'ok', source: 'zerobounce' };
    if (status === 'catch-all' || status === 'catch_all') return { result: 'catch_all', source: 'zerobounce' };
    if (['invalid', 'spamtrap', 'abuse', 'do_not_mail'].includes(status)) return { result: 'reject', source: 'zerobounce' };
    return { result: 'unchecked', source: 'zerobounce' };
  }
  return null;
}

export async function verifyAll(email, options) {
  const primary = await verifyEmail(email, options);
  const calls = [{ finder: 'millionverifier', credits: MV_KEY ? 1 : 0 }];
  let backup = null;
  try { backup = await backupVerify(email); } catch { backup = null; }
  if (backup) calls.push({ finder: backup.source, credits: 1 });
  return {
    result: combineVerification(primary, backup?.result || null),
    primary,
    backup: backup?.result || null,
    backupSource: backup?.source || null,
    calls,
  };
}

// ── Existing paid-vendor stages, unchanged ──

async function anymailPerson(name, domain) {
  if (!name || !domain || !ANYMAIL_KEY || !hasFullName(name)) return null;
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': ANYMAIL_KEY },
      body: JSON.stringify({ full_name: name, domain }),
    });
    const d = await r.json();
    return d.email || null;
  } catch (e) { return null; }
}

async function prospeoLookup(firstName, lastName, businessName, domain) {
  if (!PROSPEO_KEY || !firstName || !lastName) return null;
  try {
    const response = await fetch('https://api.prospeo.io/email-finder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KEY': PROSPEO_KEY },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, company: businessName || domain || undefined }),
    });
    const payload = await response.json();
    const email = payload?.response?.email?.email || payload?.response?.email || payload?.email || null;
    return typeof email === 'string' ? email : null;
  } catch { return null; }
}

async function fullEnrichLookup(firstName, lastName, domain, businessName) {
  if (!firstName || !lastName || !domain || !FULLENRICH_KEY) return { work: null, personal: null };
  try {
    const postRes = await fetch('https://app.fullenrich.com/api/v2/contact/enrich/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FULLENRICH_KEY}` },
      body: JSON.stringify({
        name: `${firstName} ${lastName} @ ${domain}`,
        data: [{ first_name: firstName, last_name: lastName, domain, company_name: businessName || undefined, enrich_fields: ['contact.work_emails', 'contact.personal_emails'] }],
      }),
    });
    const postData = await postRes.json();
    const enrichmentId = postData.enrichment_id;
    if (!enrichmentId) return { work: null, personal: null };
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const getRes = await fetch(`https://app.fullenrich.com/api/v2/contact/enrich/bulk/${enrichmentId}`, { headers: { Authorization: `Bearer ${FULLENRICH_KEY}` } });
      const getData = await getRes.json();
      if (getData.status === 'FINISHED') {
        const info = getData.data?.[0]?.contact_info || {};
        const work = info.most_probable_work_email?.email || info.work_emails?.[0]?.email || (typeof info.work_emails?.[0] === 'string' ? info.work_emails[0] : null) || null;
        const personal = info.most_probable_personal_email?.email || info.personal_emails?.[0]?.email || (typeof info.personal_emails?.[0] === 'string' ? info.personal_emails[0] : null) || null;
        return { work, personal };
      }
      if (['CANCELED', 'CREDITS_INSUFFICIENT'].includes(getData.status)) return { work: null, personal: null };
    }
    return { work: null, personal: null };
  } catch { return { work: null, personal: null }; }
}

export async function enrichOne(biz) {
  return enrichLead(biz, {
    anymailPerson: ANYMAIL_KEY ? async (person, domain) => {
      const email = await anymailPerson(person.full, domain);
      return { email, calls: [{ finder: 'anymail_person', stage: 'email', credits: 1 }] };
    } : null,
    fullEnrich: FULLENRICH_KEY ? async (person, domain, business) => {
      const found = await fullEnrichLookup(person.first, person.last, domain, business.business_name);
      return { ...found, calls: [{ finder: 'fullenrich', stage: 'email', credits: 1 }] };
    } : null,
    prospeo: PROSPEO_KEY ? async (person, business) => {
      const email = await prospeoLookup(person.first, person.last, business.business_name, business.domain);
      return { email, calls: [{ finder: 'prospeo', stage: 'email', credits: 1 }] };
    } : null,
    verifyEmail: email => verifyAll(email),
  });
}

function normName(n) {
  return (n || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function applyOwnerGrouping(results) {
  const groups = {};
  results.forEach((r, i) => {
    const key = hasFullName(r.owner_name) ? normName(r.owner_name) : null;
    if (!key) return;
    (groups[key] = groups[key] || []).push(i);
  });

  for (const key of Object.keys(groups)) {
    const idxs = groups[key];
    if (idxs.length < 2) continue;

    let primaryIdx = idxs.find(i => results[i].inbox_type === 'personal' && results[i].verification === 'ok' && results[i].email);
    if (primaryIdx === undefined) primaryIdx = idxs.find(i => results[i].loadable && results[i].email);
    if (primaryIdx === undefined) primaryIdx = idxs.find(i => results[i].email);
    if (primaryIdx === undefined) primaryIdx = idxs[0];

    const primary = results[primaryIdx];

    for (const i of idxs) {
      if (i === primaryIdx) {
        results[i].duplicate_owner = false;
        continue;
      }
      if (primary.email && !results[i].email) {
        results[i].email        = primary.email;
        results[i].email_owner  = primary.email_owner || results[i].owner_name;
        results[i].email_source = 'cross_domain_owner';
        results[i].verification = primary.verification;
        results[i].inbox_type   = primary.inbox_type || null;
        results[i].enriched     = primary.inbox_type === 'personal' && primary.verification === 'ok';
      }
      results[i].duplicate_owner = true;
      results[i].loadable        = false;
      results[i].hold_reason     = 'duplicate_owner';
      results[i].primary_business = primary.business_name || null;
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requirePipelineAccess(req, res)) return;

  const { businesses } = req.body || {};
  if (!businesses || !Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses array required' });
  }

  try {
    let results = await Promise.all(businesses.map(biz => enrichOne(biz)));
    results = applyOwnerGrouping(results);

    const enriched   = results.filter(r => r.enriched);
    const loadable   = results.filter(r => r.loadable && r.email);
    const catchAll   = results.filter(r => r.hold_reason === 'catch_all');
    const duplicates = results.filter(r => r.hold_reason === 'duplicate_owner');
    const unchecked  = results.filter(r => r.verification === 'unchecked');

    return res.status(200).json({
      total:          results.length,
      enriched_count: enriched.length,
      loadable_count: loadable.length,
      hit_rate:       results.length > 0 ? Math.round((enriched.length / results.length) * 100) : 0,
      loadable_rate:  results.length > 0 ? Math.round((loadable.length / results.length) * 100) : 0,
      verification: {
        verifier:        MV_KEY ? 'millionverifier' : 'none_configured',
        loadable:        loadable.length,
        catch_all_held:  catchAll.length,
        duplicate_held:  duplicates.length,
        unchecked:       unchecked.length,
      },
      results,
      stages_summary: {
        personal_won: results.filter(r => r.inbox_type === 'personal' && r.verification === 'ok').length,
        website_personal_won: results.filter(r => r.email_source === 'website_email' && r.inbox_type === 'personal').length,
        anymail_person_attempted: results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('anymail_person:'))).length,
        anymail_person_won: results.filter(r => r.email_source === 'anymail_person').length,
        fullenrich_attempted: results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('fullenrich:') && s !== 'fullenrich:skipped_budget')).length,
        fullenrich_won: results.filter(r => r.email_source === 'fullenrich' || r.email_source === 'fullenrich_personal').length,
        prospeo_attempted: results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('prospeo:'))).length,
        prospeo_won: results.filter(r => r.email_source === 'prospeo').length,
        flagged_not_founder: results.reduce((total, row) => total + (row.flagged_emails?.length || 0), 0),
        finders_skipped: results.filter(r => r.skipped_finders).length,
        cross_domain_recovered: results.filter(r => r.email_source === 'cross_domain_owner').length,
      },
    });
  } catch (err) {
    console.error('Enrich handler error:', err);
    return res.status(500).json({ error: err.message || String(err) || 'Unknown error in enrich handler' });
  }
}
