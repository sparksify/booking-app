export const config = { maxDuration: 60 };

async function getVerifiedDomain(businessName, city, placesKey) {
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': placesKey,
        'X-Goog-FieldMask': 'places.websiteUri',
      },
      body: JSON.stringify({ textQuery: `${businessName} ${city}`, maxResultCount: 1 }),
    });
    const d = await r.json();
    const uri = d.places?.[0]?.websiteUri;
    if (!uri) return null;
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch(e) { return null; }
}

async function anymailSearch(ownerName, domain, businessName, anymailKey) {
  if (ownerName && domain) {
    try {
      const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': anymailKey },
        body: JSON.stringify({ full_name: ownerName, domain }),
      });
      const d = await r.json();
      if (d.email) return { email: d.email, method: 'anymail_person' };
    } catch(e) {}
  }
  if (businessName) {
    try {
      const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': anymailKey },
        body: JSON.stringify({ full_name: ownerName || 'owner', company_name: businessName }),
      });
      const d = await r.json();
      if (d.email) return { email: d.email, method: 'anymail_company' };
    } catch(e) {}
  }
  return null;
}

async function enrichOne(biz, PLACES_KEY, ANYMAIL_KEY) {
  const { owner_name, domain: claudeDomain, business_name, city } = biz;
  let verifiedDomain = claudeDomain;

  // Google Places — get real domain
  if (PLACES_KEY) {
    const placeDomain = await getVerifiedDomain(business_name, city, PLACES_KEY);
    if (placeDomain) verifiedDomain = placeDomain;
  }

  // Anymail search
  let email = null;
  let emailStatus = 'not_found';
  if (ANYMAIL_KEY) {
    const result = await anymailSearch(owner_name, verifiedDomain, business_name, ANYMAIL_KEY);
    if (result) { email = result.email; emailStatus = result.method; }
  }

  return { ...biz, domain: verifiedDomain || claudeDomain, email, email_status: emailStatus, enriched: !!email };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

  const ANYMAIL_KEY = process.env.ANYMAIL_FINDER_API_KEY;
  const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

  // Run all enrichments IN PARALLEL — cuts time from 60s to under 15s
  const results = await Promise.all(
    businesses.map(biz => enrichOne(biz, PLACES_KEY, ANYMAIL_KEY))
  );

  const enriched = results.filter(r => r.enriched);
  return res.status(200).json({
    total: results.length,
    enriched_count: enriched.length,
    hit_rate: results.length > 0 ? Math.round((enriched.length / results.length) * 100) : 0,
    results,
  });
}
