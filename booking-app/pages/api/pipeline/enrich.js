export const config = { maxDuration: 300 };

const ANYMAIL_KEY    = process.env.ANYMAIL_FINDER_API_KEY;
const FULLENRICH_KEY = process.env.FULLENRICH_API_KEY;

// Split on "and", "&", or comma — handles "John Smith and Jane Doe", "John Smith & Jane Doe", "John Smith, Jane Doe"
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

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const getRes  = await fetch(`https://app.fullenrich.com/api/v2/contact/enrich/bulk/${enrichmentId}`, {
        headers: { 'Authorization': `Bearer ${FULLENRICH_KEY}` },
      });
      const getData = await getRes.json();
      if (getData.status === 'FINISHED') return getData.data?.[0]?.contact_info?.most_probable_work_email?.email || null;
      if (['CANCELED', 'CREDITS_INSUFFICIENT'].includes(getData.status)) return null;
    }
    return null;
  } catch (e) { return null; }
}

async function enrichOne(biz) {
  const { owner_name, domain, business_name } = biz;
  const names = parseOwnerNames(owner_name);
  const tried = [];

  // Stage 1a — Anymail person, tries EACH parsed owner name individually
  for (const name of names) {
    if (!hasFullName(name)) continue;
    tried.push('anymail_person:' + name);
    const email = await anymailPerson(name, domain);
    if (email) return { ...biz, email, email_owner: name, email_source: 'anymail_person', enriched: true, enrichment_stages_tried: tried, owners_tried: names };
  }

  // Stage 1b — Anymail company fallback
  tried.push('anymail_company');
  const companyEmail = await anymailCompany(business_name);
  if (companyEmail) return { ...biz, email: companyEmail, email_owner: null, email_source: 'anymail_company', enriched: true, enrichment_stages_tried: tried, owners_tried: names };

  // Stage 2 — FullEnrich, tries EACH parsed owner name individually
  if (FULLENRICH_KEY && domain) {
    for (const name of names) {
      if (!hasFullName(name)) continue;
      const parts = name.trim().split(/\s+/);
      tried.push('fullenrich:' + name);
      const email = await fullEnrichLookup(parts[0], parts.slice(1).join(' '), domain);
      if (email) return { ...biz, email, email_owner: name, email_source: 'fullenrich', enriched: true, enrichment_stages_tried: tried, owners_tried: names };
    }
  }

  return { ...biz, email: null, email_owner: null, email_source: 'not_found', enriched: false, enrichment_stages_tried: tried, owners_tried: names };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

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
        fullenrich_attempted:      results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('fullenrich'))).length,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
