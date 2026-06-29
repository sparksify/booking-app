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

async function extractOwnerAndSignal(businessName, html) {
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
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Extract two things from this business website page for "${businessName}":

1. OWNER: The full name of the owner or founder. Must be the primary owner/founder, not staff.
2. SIGNAL: One specific, genuine compliment about this business. Look for: award wins, press features, years in business, a specific menu item or service they're known for, a standout customer quote, community recognition, or anything that makes them distinctly notable. Must be specific and real — not generic. If nothing specific exists, return NOT_FOUND for signal.

Page HTML:
${html.slice(0, 20000)}

Return ONLY valid JSON, no markdown:
{
  "owner": "Full Name or NOT_FOUND",
  "signal": "One specific notable thing about this business or NOT_FOUND"
}`,
        }],
      }),
    });
    const d = await r.json();
    const text = d.content?.[0]?.text?.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      owner: parsed.owner !== 'NOT_FOUND' ? parsed.owner : null,
      signal: parsed.signal !== 'NOT_FOUND' ? parsed.signal : null,
    };
  } catch (e) {
    return { owner: null, signal: null };
  }
}

async function findOwnerOnWebsite(businessName, website) {
  if (!website) return { owner: null, signal: null };

  let base;
  try {
    const u = new URL(website);
    base = `${u.protocol}//${u.hostname}`;
  } catch (e) {
    return { owner: null, signal: null };
  }

  const urls = [website, ...OWNER_PAGE_SLUGS.map(s => `${base}/${s}`)];

  for (const url of urls) {
    const html = await fetchPage(url);
    if (!html) continue;
    const result = await extractOwnerAndSignal(businessName, html);
    // Keep going if we got a signal even without an owner name
    if (result.owner || result.signal) return result;
  }

  return { owner: null, signal: null };
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
    return name;
  } catch (e) {
    return null;
  }
}

async function discoverOne(biz) {
  const { business_name, city, website, rating, review_count } = biz;

  // Step 1 — scrape website, extract owner + signal in one Claude call
  const websiteResult = await findOwnerOnWebsite(business_name, website);

  // Build signal — use website signal, or fall back to SerpAPI rating/reviews
  let signal = websiteResult.signal;
  if (!signal && rating && review_count) {
    signal = `${rating} stars across ${review_count} reviews on Google`;
  }

  if (websiteResult.owner) {
    return {
      ...biz,
      owner_name: websiteResult.owner,
      owner_source: 'website',
      signal,
    };
  }

  // Step 2 — Google News fallback for owner name
  const newsOwner = await findOwnerViaNews(business_name, city);
  if (newsOwner) {
    return {
      ...biz,
      owner_name: newsOwner,
      owner_source: 'news',
      signal,
    };
  }

  return {
    ...biz,
    owner_name: null,
    owner_source: 'not_found',
    signal,
  };
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
