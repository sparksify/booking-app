const GENERIC_PREFIXES = ['info','hello','help','contact','support','admin','office','team','mail','inquiries','general','service','services','booking','bookings','sales','marketing','hello','hey','hi','intake','schedule','scheduling','ask','questions','request','requests','quote','quotes','estimates','estimate'];

function isGenericEmail(email) {
  const prefix = email.split('@')[0].toLowerCase();
  return GENERIC_PREFIXES.some(g => prefix === g || prefix.startsWith(g + '.') || prefix.startsWith(g + '_'));
}

function scoreEmailAgainstOwner(email, ownerName) {
  if (!ownerName || !email) return 0;
  const prefix = email.split('@')[0].toLowerCase().replace(/[._-]/g, ' ');
  const nameParts = ownerName.toLowerCase().split(' ').filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts[nameParts.length - 1] || '';
  let score = 0;
  if (prefix.includes(firstName)) score += 3;
  if (lastName && prefix.includes(lastName)) score += 2;
  if (prefix === firstName) score += 2;
  if (prefix === `${firstName}${lastName}`) score += 2;
  if (prefix === `${firstName}.${lastName}`) score += 2;
  if (prefix.startsWith(firstName[0] || '')) score += 1;
  return score;
}

function isPersonalEmail(email, ownerName) {
  if (isGenericEmail(email)) return false;
  if (!ownerName) return true; // no owner to cross-ref, accept non-generic
  return scoreEmailAgainstOwner(email, ownerName) > 0;
}

async function scrapeWebsiteForEmail(website, ownerName, anthropicKey) {
  try {
    const base = website.startsWith('http') ? website : `https://${website}`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Visit the contact page and about page of ${base} and find any email address for the owner or a named person. I am looking for a personal business email like firstname@domain.com or firstname.lastname@domain.com. Do NOT return generic emails like info@, contact@, hello@, or support@. Return ONLY the email address if you find a personal one, or the word "none" if you only find generic emails or no email at all.` }],
      }),
    });
    const d = await r.json();
    const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) return null;
    const found = emailMatch[0].toLowerCase();
    if (isGenericEmail(found)) return null;
    if (ownerName && scoreEmailAgainstOwner(found, ownerName) === 0) return null;
    return found;
  } catch(e) {
    return null;
  }
}

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

async function anymailPersonSearch(ownerName, domain, anymailKey) {
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': anymailKey },
      body: JSON.stringify({ full_name: ownerName, domain }),
    });
    const d = await r.json();
    if (!d.email) return null;
    if (isGenericEmail(d.email)) return null;
    if (ownerName && scoreEmailAgainstOwner(d.email, ownerName) === 0) return null;
    return d.email;
  } catch(e) {
    return null;
  }
}

async function anymailCompanySearch(businessName, anymailKey) {
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': anymailKey },
      body: JSON.stringify({ full_name: 'owner', company_name: businessName }),
    });
    const d = await r.json();
    if (!d.email) return null;
    if (isGenericEmail(d.email)) return null;
    return d.email;
  } catch(e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

  const ANYMAIL_KEY = process.env.ANYMAIL_FINDER_API_KEY;
  const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const results = [];

  for (const biz of businesses) {
    const { owner_name, domain: claudeDomain, business_name, city, website: claudeWebsite } = biz;
    let email = null;
    let emailStatus = 'not_found';
    const path = [];

    // Step 1: Scrape website directly — cheapest, fastest, no API credits
    const websiteToScrape = claudeWebsite || (claudeDomain ? `https://${claudeDomain}` : null);
    if (websiteToScrape && ANTHROPIC_KEY) {
      const scraped = await scrapeWebsiteForEmail(websiteToScrape, owner_name, ANTHROPIC_KEY);
      if (scraped) {
        email = scraped;
        emailStatus = 'website_scrape';
        path.push('scrape:✓');
      } else {
        path.push('scrape:✗');
      }
    }

    // Step 2: Google Places → get verified real domain
    let verifiedDomain = claudeDomain;
    if (!email && PLACES_KEY) {
      const placeDomain = await getVerifiedDomain(business_name, city, PLACES_KEY);
      if (placeDomain) {
        verifiedDomain = placeDomain;
        path.push(`places:${placeDomain}`);
      } else {
        path.push('places:✗');
      }
    }

    // Step 3: Anymail person search with verified domain
    if (!email && verifiedDomain && owner_name && ANYMAIL_KEY) {
      const found = await anymailPersonSearch(owner_name, verifiedDomain, ANYMAIL_KEY);
      if (found) {
        email = found;
        emailStatus = 'anymail_person';
        path.push('anymail_person:✓');
      } else {
        path.push('anymail_person:✗');
      }
    }

    // Step 4: Anymail company search fallback
    if (!email && ANYMAIL_KEY) {
      const found = await anymailCompanySearch(business_name, ANYMAIL_KEY);
      if (found) {
        email = found;
        emailStatus = 'anymail_company';
        path.push('anymail_company:✓');
      } else {
        path.push('anymail_company:✗');
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
