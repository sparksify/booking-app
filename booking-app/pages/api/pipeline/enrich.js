const GENERIC_PREFIXES = ['info','hello','help','contact','support','admin','office','team','mail','inquiries','general','service','services','booking','bookings','sales','marketing','intake','schedule','scheduling','ask','questions','request','requests','quote','quotes','estimates','estimate','hello','hey','hi'];

function isGenericEmail(email) {
  const prefix = email.split('@')[0].toLowerCase();
  return GENERIC_PREFIXES.some(g => prefix === g || prefix.startsWith(g + '.') || prefix.startsWith(g + '_'));
}

function scoreEmailAgainstOwner(email, ownerName) {
  if (!ownerName || !email) return 1; // no owner to validate against, accept it
  const prefix = email.split('@')[0].toLowerCase().replace(/[._-]/g, ' ');
  const nameParts = ownerName.toLowerCase().split(' ').filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts[nameParts.length - 1] || '';
  let score = 0;
  if (firstName && prefix.includes(firstName)) score += 3;
  if (lastName && prefix.includes(lastName)) score += 2;
  if (firstName && prefix.startsWith(firstName[0])) score += 1;
  return score;
}

function isValidOwnerEmail(email, ownerName) {
  if (!email) return false;
  if (isGenericEmail(email)) return false;
  return scoreEmailAgainstOwner(email, ownerName) > 0;
}

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
  } catch(e) {
    return null;
  }
}

async function anymailSearch(ownerName, domain, businessName, anymailKey) {
  // Try person search first if we have owner name
  if (ownerName && domain) {
    try {
      const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': anymailKey },
        body: JSON.stringify({ full_name: ownerName, domain }),
      });
      const d = await r.json();
      if (d.email && isValidOwnerEmail(d.email, ownerName)) return { email: d.email, method: 'anymail_person' };
    } catch(e) {}
  }

  // Fallback: company name search
  if (businessName) {
    try {
      const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': anymailKey },
        body: JSON.stringify({ full_name: ownerName || 'owner', company_name: businessName }),
      });
      const d = await r.json();
      if (d.email && !isGenericEmail(d.email)) return { email: d.email, method: 'anymail_company' };
    } catch(e) {}
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

  const ANYMAIL_KEY = process.env.ANYMAIL_FINDER_API_KEY;
  const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

  const results = [];

  for (const biz of businesses) {
    const { owner_name, domain: claudeDomain, business_name, city } = biz;
    let email = null;
    let emailStatus = 'not_found';
    let verifiedDomain = claudeDomain;
    const path = [];

    // Step 1: Google Places → get verified real domain
    if (PLACES_KEY) {
      const placeDomain = await getVerifiedDomain(business_name, city, PLACES_KEY);
      if (placeDomain) {
        verifiedDomain = placeDomain;
        path.push(`places:✓ ${placeDomain}`);
      } else {
        path.push('places:✗');
      }
    }

    // Step 2: Anymail with verified domain + owner name validation
    if (ANYMAIL_KEY) {
      const result = await anymailSearch(owner_name, verifiedDomain, business_name, ANYMAIL_KEY);
      if (result) {
        email = result.email;
        emailStatus = result.method;
        path.push(`${result.method}:✓`);
      } else {
        path.push('anymail:✗');
      }
    }

    results.push({
      ...biz,
      domain: verifiedDomain || claudeDomain,
      email,
      email_status: emailStatus,
      enriched: !!email,
      enrichment_path: path.join(' → '),
    });

    await new Promise(r => setTimeout(r, 400));
  }

  const enriched = results.filter(r => r.enriched);
  return res.status(200).json({
    total: results.length,
    enriched_count: enriched.length,
    hit_rate: results.length > 0 ? Math.round((enriched.length / results.length) * 100) : 0,
    results,
  });
}
