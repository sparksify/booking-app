export const config = { maxDuration: 290 };

const ANYMAIL_KEY    = process.env.ANYMAIL_FINDER_API_KEY;
const FULLENRICH_KEY = process.env.FULLENRICH_API_KEY;
const PROSPEO_KEY    = process.env.PROSPEO_API_KEY;
const MV_KEY         = process.env.MILLIONVERIFIER_API_KEY;

function parseOwnerNames(ownerName) {
  if (!ownerName) return [];
  return ownerName
    .split(/\s+and\s+|\s*&\s*|,\s*/i)
    .map(n => n.trim())
    .filter(Boolean);
}

function hasFullName(name) {
  if (!name) return false;
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 && parts[1].length > 1;
}

function pickOwner(names) {
  return names.find(hasFullName) || names[0] || null;
}

async function verifyEmail(email) {
  if (!email) return 'reject';
  if (!MV_KEY) return 'unchecked';
  try {
    const params = new URLSearchParams({ api: MV_KEY, email, timeout: '10' });
    const r = await fetch(`https://api.millionverifier.com/api/v3/?${params}`);
    const d = await r.json();
    if (d.result === 'ok')         return 'ok';
    if (d.result === 'catch_all')  return 'catch_all';
    return 'reject';
  } catch (e) {
    return 'unchecked';
  }
}

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

async function anymailCompany(businessName) {
  if (!businessName || !ANYMAIL_KEY) return null;
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': ANYMAIL_KEY },
      body: JSON.stringify({ full_name: 'owner', company_name: businessName }),
    });
    const d = await r.json();
    return d.email || null;
  } catch (e) { return null; }
}

async function prospeoLookup(firstName, lastName, businessName, domain) {
  if (!PROSPEO_KEY || !firstName || !lastName) return null;
  try {
    const r = await fetch('https://api.prospeo.io/email-finder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KEY': PROSPEO_KEY },
      body: JSON.stringify({
        first_name: firstName,
        last_name:  lastName,
        company:    businessName || domain || undefined,
      }),
    });
    const d = await r.json();
    return d?.response?.email?.email || d?.response?.email || d?.email || null;
  } catch (e) { return null; }
}

async function fullEnrichLookup(firstName, lastName, domain, businessName) {
  if (!firstName || !lastName || !domain || !FULLENRICH_KEY) return { work: null, personal: null };
  try {
    const postRes = await fetch('https://app.fullenrich.com/api/v2/contact/enrich/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${FULLENRICH_KEY}` },
      body: JSON.stringify({
        name: `${firstName} ${lastName} @ ${domain}`,
        data: [{
          first_name: firstName,
          last_name:  lastName,
          domain,
          company_name: businessName || undefined,
          enrich_fields: ['contact.work_emails', 'contact.personal_emails'],
        }],
      }),
    });
    const postData = await postRes.json();
    const enrichmentId = postData.enrichment_id;
    if (!enrichmentId) return { work: null, personal: null };

    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const getRes  = await fetch(`https://app.fullenrich.com/api/v2/contact/enrich/bulk/${enrichmentId}`, {
        headers: { 'Authorization': `Bearer ${FULLENRICH_KEY}` },
      });
      const getData = await getRes.json();
      if (getData.status === 'FINISHED') {
        const ci = getData.data?.[0]?.contact_info || {};
        const work =
          ci.most_probable_work_email?.email ||
          ci.work_emails?.[0]?.email ||
          (typeof ci.work_emails?.[0] === 'string' ? ci.work_emails[0] : null) ||
          null;
        const personal =
          ci.most_probable_personal_email?.email ||
          ci.personal_emails?.[0]?.email ||
          (typeof ci.personal_emails?.[0] === 'string' ? ci.personal_emails[0] : null) ||
          null;
        return { work, personal };
      }
      if (['CANCELED', 'CREDITS_INSUFFICIENT'].includes(getData.status)) return { work: null, personal: null };
    }
    return { work: null, personal: null };
  } catch (e) { return { work: null, personal: null }; }
}

const PIPELINE_START = Date.now();
const MAX_BUDGET_MS = 250000;
function timeRemaining() { return MAX_BUDGET_MS - (Date.now() - PIPELINE_START); }

function mk(biz, email, owner, source, verification, loadable, holdReason, tried) {
  return {
    ...biz,
    email,
    email_owner: owner,
    email_source: source,
    verification,
    loadable,
    hold_reason: holdReason,
    enriched: true,
    enrichment_stages_tried: tried,
  };
}

async function enrichOne(biz) {
  const { owner_name, domain, business_name } = biz;
  const websiteEmails = biz.website_emails || (biz.website_email ? [biz.website_email] : []);
  const names = parseOwnerNames(owner_name);
  const tried = [];
  let heldCatchAll = null;

  for (const we of websiteEmails) {
    tried.push('website_email:' + we);
    const v = await verifyEmail(we);
    if (v === 'ok' || v === 'unchecked')
      return mk(biz, we, pickOwner(names), 'website_email', v, true, null, tried);
    if (v === 'catch_all' && !heldCatchAll)
      heldCatchAll = { email: we, owner: pickOwner(names), source: 'website_email' };
  }

  for (const name of names) {
    if (!hasFullName(name)) continue;
    tried.push('anymail_person:' + name);
    const email = await anymailPerson(name, domain);
    if (email) return mk(biz, email, name, 'anymail_person', 'skipped_verified_source', true, null, tried);
  }

  if (PROSPEO_KEY) {
    for (const name of names) {
      if (!hasFullName(name)) continue;
      const parts = name.trim().split(/\s+/);
      tried.push('prospeo:' + name);
      const email = await prospeoLookup(parts[0], parts.slice(1).join(' '), business_name, domain);
      if (email) return mk(biz, email, name, 'prospeo', 'skipped_verified_source', true, null, tried);
    }
  }

  tried.push('anymail_company');
  const companyEmail = await anymailCompany(business_name);
  if (companyEmail) {
    const v = await verifyEmail(companyEmail);
    if (v === 'ok' || v === 'unchecked')
      return mk(biz, companyEmail, null, 'anymail_company', v, true, null, tried);
    if (v === 'catch_all' && !heldCatchAll)
      heldCatchAll = { email: companyEmail, owner: null, source: 'anymail_company' };
  }

  if (FULLENRICH_KEY && domain && timeRemaining() > 20000) {
    for (const name of names) {
      if (!hasFullName(name)) continue;
      if (timeRemaining() < 20000) break;
      const parts = name.trim().split(/\s+/);
      tried.push('fullenrich:' + name);
      const fe = await fullEnrichLookup(parts[0], parts.slice(1).join(' '), domain, business_name);
      if (fe.work)
        return mk(biz, fe.work, name, 'fullenrich', 'skipped_verified_source', true, null, tried);
      if (fe.personal) {
        const v = await verifyEmail(fe.personal);
        if (v === 'ok' || v === 'unchecked')
          return mk(biz, fe.personal, name, 'fullenrich_personal', v, true, null, tried);
        if (v === 'catch_all' && !heldCatchAll)
          heldCatchAll = { email: fe.personal, owner: name, source: 'fullenrich_personal' };
      }
    }
  } else if (FULLENRICH_KEY && domain) {
    tried.push('fullenrich:skipped_budget');
  }

  if (heldCatchAll) {
    return mk(biz, heldCatchAll.email, heldCatchAll.owner, heldCatchAll.source, 'catch_all', false, 'catch_all', tried);
  }

  return { ...biz, email: null, email_owner: null, email_source: 'not_found', verification: null, loadable: false, hold_reason: null, enriched: false, enrichment_stages_tried: tried };
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

    let primaryIdx = idxs.find(i => results[i].loadable && results[i].email);
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
        results[i].enriched     = true;
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

  const { businesses } = req.body;
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
        website_email_attempted:   results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('website_email'))).length,
        website_email_won:         results.filter(r => r.email_source === 'website_email').length,
        anymail_person_attempted:  results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('anymail_person'))).length,
        prospeo_attempted:         results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('prospeo'))).length,
        anymail_company_attempted: results.filter(r => r.enrichment_stages_tried?.includes('anymail_company')).length,
        fullenrich_attempted:      results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('fullenrich:') && s !== 'fullenrich:skipped_budget')).length,
        fullenrich_personal_won:   results.filter(r => r.email_source === 'fullenrich_personal').length,
        cross_domain_recovered:    results.filter(r => r.email_source === 'cross_domain_owner').length,
        fullenrich_skipped_budget: results.filter(r => r.enrichment_stages_tried?.includes('fullenrich:skipped_budget')).length,
      },
    });
  } catch (err) {
    console.error('Enrich handler error:', err);
    return res.status(500).json({ error: err.message || String(err) || 'Unknown error in enrich handler' });
  }
}
