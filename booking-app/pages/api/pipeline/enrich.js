export const config = { maxDuration: 300 };

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const ANYMAIL_API_KEY = process.env.ANYMAIL_FINDER_API_KEY;

// Split "John Smith and Jane Doe" or "John Smith & Jane Doe" into individual names
function parseOwnerNames(ownerName) {
  if (!ownerName) return [];
  return ownerName
    .split(/\s+and\s+|\s*&\s*|,\s*/)
    .map(n => n.trim())
    .filter(Boolean);
}

async function anymailPerson(name, domain) {
  if (!name || !domain || !ANYMAIL_API_KEY) return null;
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ANYMAIL_API_KEY,
      },
      body: JSON.stringify({ full_name: name, domain }),
    });
    const d = await r.json();
    return d.email || null;
  } catch (e) { return null; }
}

async function anymailCompany(businessName) {
  if (!businessName || !ANYMAIL_API_KEY) return null;
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ANYMAIL_API_KEY,
      },
      body: JSON.stringify({ full_name: 'owner', company_name: businessName }),
    });
    const d = await r.json();
    return d.email || null;
  } catch (e) { return null; }
}

async function hunterPerson(name, domain) {
  if (!name || !domain || !HUNTER_API_KEY) return null;
  try {
    const [first, ...rest] = name.split(' ');
    const last = rest.join(' ');
    if (!first || !last) return null;
    const params = new URLSearchParams({
      first_name: first,
      last_name: last,
      domain,
      api_key: HUNTER_API_KEY,
    });
    const r = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
    const d = await r.json();
    return d.data?.email || null;
  } catch (e) { return null; }
}

async function hunterDomain(domain) {
  if (!domain || !HUNTER_API_KEY) return null;
  try {
    const params = new URLSearchParams({ domain, api_key: HUNTER_API_KEY });
    const r = await fetch(`https://api.hunter.io/v2/domain-search?${params}`);
    const d = await r.json();
    // Return the first email that looks like an owner/founder/general contact
    const emails = d.data?.emails || [];
    const priority = emails.find(e =>
      ['owner', 'founder', 'ceo', 'president', 'info', 'hello', 'contact']
        .some(kw => e.value?.toLowerCase().includes(kw))
    );
    return priority?.value || emails[0]?.value || null;
  } catch (e) { return null; }
}

async function enrichOne(biz) {
  const { owner_name, domain, business_name } = biz;

  const names = parseOwnerNames(owner_name);

  // Try each owner name through the waterfall, return first hit
  for (const name of names) {
    // 1. Anymail person search
    const anymailHit = await anymailPerson(name, domain);
    if (anymailHit) return {
      ...biz,
      email: anymailHit,
      email_owner: name,
      email_source: 'anymail_person',
      enriched: true,
    };

    // 2. Hunter person search
    const hunterHit = await hunterPerson(name, domain);
    if (hunterHit) return {
      ...biz,
      email: hunterHit,
      email_owner: name,
      email_source: 'hunter_person',
      enriched: true,
    };
  }

  // 3. Anymail company fallback
  const anymailCompanyHit = await anymailCompany(business_name);
  if (anymailCompanyHit) return {
    ...biz,
    email: anymailCompanyHit,
    email_owner: null,
    email_source: 'anymail_company',
    enriched: true,
  };

  // 4. Hunter domain search fallback
  const hunterDomainHit = await hunterDomain(domain);
  if (hunterDomainHit) return {
    ...biz,
    email: hunterDomainHit,
    email_owner: null,
    email_source: 'hunter_domain',
    enriched: true,
  };

  return { ...biz, email: null, email_owner: null, email_source: 'not_found', enriched: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses array required' });
  }

  try {
    const results = await Promise.all(businesses.map(biz => enrichOne(biz)));

    const enriched = results.filter(r => r.enriched);

    return res.status(200).json({
      total: results.length,
      enriched_count: enriched.length,
      hit_rate: results.length > 0
        ? Math.round((enriched.length / results.length) * 100)
        : 0,
      results,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
