export const config = { maxDuration: 300 };

const SERP_API_KEY = process.env.SERP_API_KEY;
const OWNER_PAGE_SLUGS = ['about', 'about-us', 'our-story', 'team', 'meet-the-team', 'contact', 'our-team', 'founders', 'staff'];

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
  } catch (e) { return null; }
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Extract two things from this business website page for "${businessName}":

1. OWNER: The full name(s) of the owner or founder. Must be the primary owner/founder, not staff or manager.
   - If there is exactly ONE owner, return just their full name: "John Smith"
   - If there are MULTIPLE owners, separate them with " and " exactly: "John Smith and Jane Doe"
   - Never merge multiple names together without "and" between them
   - If nothing found, return NOT_FOUND

2. SIGNAL: One specific, genuine notable fact about this business. If nothing specific exists, return NOT_FOUND.

Page HTML:
${html.slice(0, 20000)}

Return ONLY valid JSON, no markdown:
{"owner":"Full Name or Name1 and Name2 or NOT_FOUND","signal":"Notable fact or NOT_FOUND"}`,
        }],
      }),
    });
    const d = await r.json();
    const text = d.content?.[0]?.text?.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return {
      owner:  parsed.owner  !== 'NOT_FOUND' ? parsed.owner  : null,
      signal: parsed.signal !== 'NOT_FOUND' ? parsed.signal : null,
    };
  } catch (e) { return { owner: null, signal: null }; }
}

async function findOwnerOnWebsite(businessName, website) {
  if (!website) return { owner: null, signal: null };
  let base;
  try {
    const u = new URL(website);
    base = `${u.protocol}//${u.hostname}`;
  } catch (e) { return { owner: null, signal: null }; }

  const urls = [website, ...OWNER_PAGE_SLUGS.map(s => `${base}/${s}`)];
  for (const url of urls) {
    const html = await fetchPage(url);
    if (!html) continue;
    const result = await extractOwnerAndSignal(businessName, html);
    if (result.owner || result.signal) return result;
  }
  return { owner: null, signal: null };
}

function extractAiOverviewText(aiOverview) {
  if (!aiOverview?.text_blocks) return '';
  const lines = [];
  for (const block of aiOverview.text_blocks) {
    if (block.snippet) lines.push(block.snippet);
    if (block.list) {
      for (const item of block.list) {
        if (item.title) lines.push(item.title);
        if (item.snippet) lines.push(item.snippet);
      }
    }
  }
  return lines.join('\n');
}

async function fetchAiOverviewPageToken(pageToken) {
  if (!pageToken || !SERP_API_KEY) return '';
  try {
    const params = new URLSearchParams({ engine: 'google_ai_overview', page_token: pageToken, api_key: SERP_API_KEY });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    if (!r.ok) return '';
    const data = await r.json();
    return extractAiOverviewText(data.ai_overview);
  } catch (e) { return ''; }
}

// Tag each snippet with which query produced it, so we can tell Claude
// which result block to trust if there's ambiguity (e.g. STL Café vs St. Louis cafes)
async function serpSearch(query) {
  if (!SERP_API_KEY) return [];
  try {
    const params = new URLSearchParams({ engine: 'google', q: query, num: '10', api_key: SERP_API_KEY });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    if (!r.ok) return [];
    const data = await r.json();

    const snippets = [];

    if (data.ai_overview) {
      const directText = extractAiOverviewText(data.ai_overview);
      if (directText) {
        snippets.push(`[AI Overview for query "${query}"]: ${directText}`);
      } else if (data.ai_overview.page_token) {
        const followUpText = await fetchAiOverviewPageToken(data.ai_overview.page_token);
        if (followUpText) snippets.push(`[AI Overview for query "${query}"]: ${followUpText}`);
      }
    }

    if (data.answer_box?.answer)   snippets.push(`[Answer box]: ${data.answer_box.answer}`);
    if (data.answer_box?.snippet)  snippets.push(`[Answer box]: ${data.answer_box.snippet}`);
    if (data.knowledge_graph?.description) snippets.push(`[Knowledge graph]: ${data.knowledge_graph.description}`);

    (data.organic_results || []).forEach(r => {
      const parts = [];
      if (r.title)   parts.push(r.title);
      if (r.snippet) parts.push(r.snippet);
      if (r.rich_snippet?.top?.extensions) parts.push(r.rich_snippet.top.extensions.join(' '));
      if (parts.length) snippets.push(`[Organic result, source: ${r.source || r.displayed_link || 'unknown'}]: ${parts.join(' — ')}`);
    });

    (data.related_questions || []).forEach(q => {
      if (q.snippet) snippets.push(`[Related question]: ${q.snippet}`);
    });

    return snippets;
  } catch (e) { return []; }
}

async function findOwnerViaSearch(businessName, city, attempt = 1) {
  // Always include city in every query to disambiguate similarly-named businesses
  const queries = attempt === 1
    ? [
        `"${businessName}" ${city} owner`,
        `"${businessName}" ${city} founder`,
        `"${businessName}" ${city} managing partner`,
      ]
    : [
        // Retry pass — more forceful exact match, strips out wiki/generic noise
        `"${businessName}" "${city}" owner -wikipedia`,
        `"${businessName}" "${city}" restaurant owner operator`,
      ];

  const snippetArrays = await Promise.all(queries.map(q => serpSearch(q)));
  const allSnippets = [...new Set(snippetArrays.flat())].join('\n\n');
  if (!allSnippets.trim()) return null;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Extract the owner, founder, or managing partner name(s) of "${businessName}" located in ${city} from these search result snippets.

IMPORTANT — disambiguation: These snippets may contain information about OTHER businesses with similar or identical names in different cities (e.g. a search for "STL Café" might return results about unrelated cafes in St. Louis). Only extract the owner if the snippet clearly refers to the business in ${city}. If a snippet doesn't mention ${city} or doesn't clearly match this specific business, ignore it.

The name may appear anywhere in the text, including subtext, captions, or secondary sentences — not just the title or first line. Read everything carefully.

Rules:
- If ONE owner: return their full name, e.g. "John Smith"
- If MULTIPLE owners: separate with " and " exactly, e.g. "John Smith and Jane Doe"
- Never merge multiple names together without "and" between them
- Must be owner, founder, or managing partner of THIS specific business in ${city} — not an employee, chef, or manager, and not the owner of a same-named business elsewhere
- Titles like "managing member," "managing partner," "owner/operator," and "founder" all count
- Full name required — first AND last name. If only a first name appears, return NOT_FOUND
- If no clear, confidently-matched owner name found, return NOT_FOUND

Snippets:
${allSnippets.slice(0, 12000)}

Reply with ONLY the name(s) or NOT_FOUND:`,
        }],
      }),
    });
    const d = await r.json();
    const name = d.content?.[0]?.text?.trim();
    if (!name || name === 'NOT_FOUND') return null;
    const parts = name.split(/\s+/);
    if (parts.length < 2 || name.length > 80) return null;
    return name;
  } catch (e) { return null; }
}

async function discoverOne(biz) {
  const { business_name, city, website, rating, review_count, owner: existingOwner } = biz;

  if (existingOwner && existingOwner.trim().split(/\s+/).length >= 2) {
    return {
      ...biz,
      owner_name:   existingOwner,
      owner_source: 'google_maps_field',
      signal:       rating && review_count ? `${rating} stars across ${review_count} reviews on Google` : null,
    };
  }

  const websiteResult = await findOwnerOnWebsite(business_name, website);
  let signal = websiteResult.signal;
  if (!signal && rating && review_count) {
    signal = `${rating} stars across ${review_count} reviews on Google`;
  }

  if (websiteResult.owner) {
    return { ...biz, owner_name: websiteResult.owner, owner_source: 'website', signal };
  }

  // First pass — city-qualified queries
  let searchOwner = await findOwnerViaSearch(business_name, city, 1);
  let source = 'google_search';

  // Retry pass — only if first pass came up empty, more forceful disambiguation
  if (!searchOwner) {
    searchOwner = await findOwnerViaSearch(business_name, city, 2);
    source = 'google_search_retry';
  }

  if (searchOwner) {
    return { ...biz, owner_name: searchOwner, owner_source: source, signal };
  }

  return { ...biz, owner_name: null, owner_source: 'not_found', signal };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    const results = await Promise.all(businesses.map(biz => discoverOne(biz)));
    const found   = results.filter(r => r.owner_name);

    const sources = {
      google_maps_field:   results.filter(r => r.owner_source === 'google_maps_field').length,
      website:             results.filter(r => r.owner_source === 'website').length,
      google_search:       results.filter(r => r.owner_source === 'google_search').length,
      google_search_retry: results.filter(r => r.owner_source === 'google_search_retry').length,
      not_found:           results.filter(r => r.owner_source === 'not_found').length,
    };

    return res.status(200).json({
      total:       results.length,
      owner_found: found.length,
      hit_rate:    results.length > 0 ? Math.round((found.length / results.length) * 100) : 0,
      sources,
      businesses:  results,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
