export const config = { maxDuration: 300 };

const FRANCHISE_NAV_PATTERNS = [
  'franchise',
  'own a business',
  'start your own',
  'open a location',
];

function quickFranchiseCheck(html) {
  const lower = html.toLowerCase();
  return FRANCHISE_NAV_PATTERNS.some(p => lower.includes(p));
}

async function fetchWebsite(url) {
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

async function claudeFranchiseCheck(businessName, html) {
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
          content: `You are checking whether a business is already a franchise system (i.e. they franchise TO others, not that they are a franchisee).

Look for: navigation links or page text mentioning franchise opportunities, becoming a franchisee, owning a franchise location, franchise development, or franchise disclosure documents (FDD).

Business: ${businessName}
Website HTML (truncated):
${html.slice(0, 15000)}

Reply with ONLY one word: FRANCHISE or INDEPENDENT`,
        }],
      }),
    });
    const d = await r.json();
    const answer = d.content?.[0]?.text?.trim().toUpperCase();
    return answer === 'FRANCHISE';
  } catch (e) {
    return false;
  }
}

async function checkOne(biz) {
  const { business_name, website } = biz;

  if (!website) {
    return { ...biz, is_franchise: false, franchise_check: 'no_website' };
  }

  const html = await fetchWebsite(website);

  if (!html) {
    return { ...biz, is_franchise: false, franchise_check: 'fetch_failed' };
  }

  if (quickFranchiseCheck(html)) {
    return { ...biz, is_franchise: true, franchise_check: 'keyword_match' };
  }

  const isFranchise = await claudeFranchiseCheck(business_name, html);
  return {
    ...biz,
    is_franchise: isFranchise,
    franchise_check: isFranchise ? 'claude_detected' : 'claude_clear',
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
    const results = await Promise.all(businesses.map(biz => checkOne(biz)));

    const passed = results.filter(b => !b.is_franchise);
    const filtered = results.filter(b => b.is_franchise);

    return res.status(200).json({
      total: results.length,
      passed: passed.length,
      filtered: filtered.length,
      filter_rate: results.length > 0
        ? Math.round((filtered.length / results.length) * 100)
        : 0,
      businesses: passed,
      filtered_businesses: filtered,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
