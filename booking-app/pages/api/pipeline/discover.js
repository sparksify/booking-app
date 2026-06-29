export const config = { maxDuration: 300 };

const SERP_API_KEY = process.env.SERP_API_KEY;
const OWNER_PAGE_SLUGS = ['about', 'about-us', 'our-story', 'team', 'meet-the-team', 'contact', 'our-team', 'founders'];

async function fetchPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const html = await r.text();
    return html.slice(0, 30000);
  } catch (e) {
    return null;
  }
}

async function extractOwnerFromHtml(businessName, html) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Extract the owner or founder's full name from this business website page.

Business: ${businessName}
Page HTML:
${html.slice(0, 20000)}

Rules:
- Return ONLY the person's full name, nothing else
- Must be the owner, founder, or operator — not a staff member or manager
- If multiple owners, return the primary one
- If no owner name is found, reply with exactly: NOT_FOUND`,
        }],
      }),
    });
    const d = await r.json();
    const name = d.content?.[0]?.text?.trim();
    if (!name || name === 'NOT_FOUND') return null;
    return name;
  } catch (e) {
    return null;
  }
}

async function findOwnerOnWebsite(businessName, website) {
  if (!website) return null;

  // Build base URL
  let base;
  try {
    const u = new URL(website);
    base = `${u.protocol}//${u.hostname}`;
  } catch (e) {
    return null;
  }

  // Try homepage first, then common owner page slugs
  const urls = [website, ...OWNER_PAGE_SLUGS.map(s => `${base}/${s}`)];

  for (const url of urls) {
    const html = await fetchPage(url);
    if (!html) continue;
    const name = await extractOwnerFromHtml(businessName, html);
    if (name) return { owner_name: name, owner_source: 'website' };
  }

  return null;
}

async function findOwnerViaNews(businessName, city) {
  if (!SERP_API_KEY) return null;

  try {
    const query = `"${businessName}" ${city} owner OR founder`;
    const params = new URLSearchParams({
      engine: 'google',
      q: query,
      num: '5',
      api_key: SERP_API_KEY,
    });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    if (!r.ok) return null;
    const data = await r.json();

    const snippets = (data.organic_results || [])
      .map(result => `${result.title || ''} ${result.snippet || ''}`)
      .join('\n');

    if (!snippets.trim()) return null;

    const cr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Extract the owner or founder's full name of "${businessName}" from these search result snippets.

Snippets:
${snippets}

Rules:
- Return ONLY the person's full name, nothing else
- Must be the owner or founder of this specific business
- If no owner name is found, reply with exactly: NOT_FOUND`,
        }],
      }),
    });
    const cd = await cr.json();
    const name = cd.content?.[0]?.text?.trim();
    if (!name || name === 'NOT_FOUND') return null;
    return { owner_name: name, owner_source: 'news' };
  } catch (e) {
    return null;
  }
}

async function discoverOne(biz) {
  const { business_name, city, website } = biz;

  // Step 1 — scrape website pages
  const websiteResult = await findOwnerOnWebsite(business_name, website);
  if (websiteResult) return { ...biz, ...websiteResult };

  // Step 2 — Google News/search fallback
  const newsResult = await findOwnerViaNews(business_name, city);
  if (newsResult) return { ...biz, ...newsResult };

  // Nothing found — pass through with null, still moves to enrich
  return { ...biz, owner_name: null, owner_source: 'not_found' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses array required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  }

  try {
    const results = await Promise.all(businesses.map(biz => discoverOne(biz)));

    const found = results.filter(r => r.owner_name);

    return res.status(200).json({
      total: results.length,
      owner_found: found.length,
      hit_rate: results.length > 0
        ? Math.round((found.length / results.length) * 100)
        : 0,
      businesses: results,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
