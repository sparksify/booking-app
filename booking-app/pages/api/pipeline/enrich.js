export const config = { maxDuration: 290 };

const ANYMAIL_KEY    = process.env.ANYMAIL_FINDER_API_KEY;
const FULLENRICH_KEY = process.env.FULLENRICH_API_KEY;

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

// Tightened: 6 attempts x 2.5s = max 15s per FullEnrich lookup (was 10 x 3s = 30s)
async function fullEnrichLookup(firstName, lastName, domain) {
  if (!firstName || !lastName || !domain || !FULLENRICH_KEY) return null;
  try {
    const postRes = await fetch('https://app.fullenrich.com/api/v2/contact/enrich/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${FULLENRICH_KEY}` },
      body: JSON.stringify({
        name: `${firstName} ${lastName} @ ${domain}`,
        data: [{ first_name: firstName, last_name: lastName, domain, enrich_fields: ['contact.work_emails'] }],
      }),
    });
    const postData = await postRes.json();
    const enrichmentId = postData.enrichment_id;
    if (!enrichmentId) return null;

    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const getRes  = await fetch(`https://app.fullenrich.com/api/v2/contact/enrich/bulk/${enrichmentId}`, {
        headers: { 'Authorization': `Bearer ${FULLENRICH_KEY}` },
      });
      const getData = await getRes.json();
      if (getData.status === 'FINISHED') return getData.data?.[0]?.contact_info?.most_probable_work_email?.email || null;
      if (['CANCELED', 'CREDITS_INSUFFICIENT'].includes(getData.status)) return null;
    }
    return null; // gave up after 15s — still counts as "tried", just didn't wait forever
  } catch (e) { return null; }
}

// Global budget check — if we're getting close to the Vercel timeout, stop trying FullEnrich
// and just return what we have. Better to finish with partial FullEnrich coverage than crash.
const PIPELINE_START = Date.now();
const MAX_BUDGET_MS = 250000; // 250s — leaves 40s buffer under the 290s function limit

function timeRemaining() {
  return MAX_BUDGET_MS - (Date.now() - PIPELINE_START);
}

async function enrichOne(biz) {
  const { owner_name, domain, business_name } = biz;
  const names = parseOwnerNames(owner_name);
  const tried = [];

  // Stage 1a — Anymail person, fast, always attempted
  for (const name of names) {
    if (!hasFullName(name)) continue;
    tried.push('anymail_person:' + name);
    const email = await anymailPerson(name, domain);
    if (email) return { ...biz, email, email_owner: name, email_source: 'anymail_person', enriched: true, enrichment_stages_tried: tried };
  }

  // Stage 1b — Anymail company fallback, fast
  tried.push('anymail_company');
  const companyEmail = await anymailCompany(business_name);
  if (companyEmail) return { ...biz, email: companyEmail, email_owner: null, email_source: 'anymail_company', enriched: true, enrichment_stages_tried: tried };

  // Stage 2 — FullEnrich, slow. Only attempt if we have budget left.
  if (FULLENRICH_KEY && domain && timeRemaining() > 20000) {
    for (const name of names) {
      if (!hasFullName(name)) continue;
      if (timeRemaining() < 20000) break; // bail mid-loop if budget runs out
      const parts = name.trim().split(/\s+/);
      tried.push('fullenrich:' + name);
      const email = await fullEnrichLookup(parts[0], parts.slice(1).join(' '), domain);
      if (email) return { ...biz, email, email_owner: name, email_source: 'fullenrich', enriched: true, enrichment_stages_tried: tried };
    }
  } else if (FULLENRICH_KEY && domain) {
    tried.push('fullenrich:skipped_budget');
  }

  return { ...biz, email: null, email_owner: null, email_source: 'not_found', enriched: false, enrichment_stages_tried: tried };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses array required' });
  }

  try {
    const results  = await Promise.all(businesses.map(biz => enrichOne(biz)));
    const enriched = results.filter(r => r.enriched);

    return res.status(200).json({
      total:          results.length,
      enriched_count: enriched.length,
      hit_rate:       results.length > 0 ? Math.round((enriched.length / results.length) * 100) : 0,
      results,
      stages_summary: {
        anymail_person_attempted:  results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('anymail_person'))).length,
        anymail_company_attempted: results.filter(r => r.enrichment_stages_tried?.includes('anymail_company')).length,
        fullenrich_attempted:      results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('fullenrich:') && s !== 'fullenrich:skipped_budget')).length,
        fullenrich_skipped_budget: results.filter(r => r.enrichment_stages_tried?.includes('fullenrich:skipped_budget')).length,
      },
    });
  } catch (err) {
    // Always return SOMETHING usable, even on unexpected failure, with the real error message
    console.error('Enrich handler error:', err);
    return res.status(500).json({ error: err.message || String(err) || 'Unknown error in enrich handler' });
  }
}
