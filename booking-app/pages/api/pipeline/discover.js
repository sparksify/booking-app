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

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_JUNK = /(example\.(com|org)|sentry|wixpress|\.png|\.jpe?g|\.gif|\.svg|\.webp|@2x|no-?reply|noreply|donotreply|godaddy|squarespace|wordpress|cloudflare|yourdomain|domain\.com|email\.com|sentry\.io)/i;
const EMAIL_ROLE = /^(info|contact|hello|admin|sales|support|office|booking|bookings|reservations|reserve|hi|team|mail|enquiries|inquiries|help|jobs|careers|press|media|marketing|accounts|billing|orders|catering)@/i;

function harvestEmails(html) {
  if (!html) return [];
  const found = [...new Set((html.match(EMAIL_RE) || []).map(e => e.toLowerCase().replace(/\.$/, '')))];
  return found.filter(e => !EMAIL_JUNK.test(e) && e.length < 60);
}

function rankEmails(emails, domain) {
  const d = (domain || '').toLowerCase();
  return [...new Set(emails)].sort((a, b) => {
    const ad = d && a.endsWith('@' + d) ? 0 : 1;
    const bd = d && b.endsWith('@' + d) ? 0 : 1;
    if (ad !== bd) return ad - bd;
    const ar = EMAIL_ROLE.test(a) ? 1 : 0;
    const br = EMAIL_ROLE.test(b) ? 1 : 0;
    if (ar !== br) return ar - br;
    return a.length - b.length;
  }).slice(0, 5);
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

async function findOwnerOnWebsite(businessName, website, domain) {
  if (!website) return { owner: null, signal: null, emails: [] };
  let base;
  try {
    const u = new URL(website);
    base = `${u.protocol}//${u.hostname}`;
  } catch (e) { return { owner: null, signal: null, emails: [] }; }

  const urls = [website, ...OWNER_PAGE_SLUGS.map(s => `${base}/${s}`)];
  let owner = null, signal = null;
  const emailSet = new Set();
  let pagesChecked = 0;

  for (const url of urls) {
    if (pagesChecked >= 6) break;
    const html = await fetchPage(url);
    if (!html) continue;
    pagesChecked++;

    harvestEmails(html).forEach(e => emailSet.add(e));

    if (!owner || !signal) {
      const result = await extractOwnerAndSignal(businessName, html);
      if (result.owner && !owner)   owner = result.owner;
      if (result.signal && !signal) signal = result.signal;
    }

    if (owner && signal && emailSet.size) break;
  }

  return { owner, signal, emails: rankEmails([...emailSet], domain) };
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

async function findOwnerViaSearch(businessName, city, pass) {
  let queries;

  if (pass === 1) {
    queries = [
      `"${businessName}" ${city} owner`,
      `"${businessName}" ${city} founder`,
      `"${businessName}" ${city} managing partner`,
    ];
  } else if (pass === 2) {
    queries = [
      `"${businessName}" "${city}" owner -wikipedia`,
      `"${businessName}" "${city}" restaurant owner operator`,
    ];
  } else {
    queries = [
      `${businessName} owner`,
    ];
  }

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

IMPORTANT — disambiguation: These snippets may contain information about OTHER businesses with similar or identical names in different cities. Only extract the owner if the snippet clearly refers to the business in ${city}, OR if the business name is distinctive enough that there's no realistic ambiguity (e.g. a unique multi-word name). If genuinely uncertain which business is being described, return NOT_FOUND.

The name may appear anywhere in the text, including subtext, captions, or secondary sentences — not just the title or first line. Read everything carefully.

Rules:
- If ONE owner: return their full name, e.g. "John Smith"
- If MULTIPLE owners: separate with " and " exactly, e.g. "John Smith and Jane Doe"
- Never merge multiple names together without "and" between them
- Must be owner, founder, or managing partner of THIS specific business — not an employee, chef, or manager
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
  const { business_name, city, website, rating, review_count, owner: existingOwner, domain } = biz;

  const signalBase = rating && review_count ? `${rating} stars across ${review_count} reviews on Google` : null;

  const websiteResult = website
    ? await findOwnerOnWebsite(business_name, website, domain)
    : { owner: null, signal: null, emails: [] };

  const website_emails = websiteResult.emails || [];
  const website_email  = website_emails[0] || null;
  const signal = websiteResult.signal || signalBase;

  if (existingOwner && existingOwner.trim().split(/\s+/).length >= 2) {
    return { ...biz, owner_name: existingOwner, owner_source: 'google_maps_field', signal, website_email, website_emails };
  }

  if (websiteResult.owner) {
    return { ...biz, owner_name: websiteResult.owner, owner_source: 'website', signal, website_email, website_emails };
  }

  let searchOwner = await findOwnerViaSearch(business_name, city, 1);
  let source = 'google_search';

  if (!searchOwner) {
    searchOwner = await findOwnerViaSearch(business_name, city, 2);
    source = 'google_search_retry';
  }

  if (!searchOwner) {
    searchOwner = await findOwnerViaSearch(business_name, city, 3);
    source = 'google_search_bare';
  }

  if (searchOwner) {
    return { ...biz, owner_name: searchOwner, owner_source: source, signal, website_email, website_emails };
  }

  return { ...biz, owner_name: null, owner_source: 'not_found', signal, website_email, website_emails };
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
      google_search_bare:  results.filter(r => r.owner_source === 'google_search_bare').length,
      not_found:           results.filter(r => r.owner_source === 'not_found').length,
    };

    return res.status(200).json({
      total:       results.length,
      owner_found: found.length,
      hit_rate:    results.length > 0 ? Math.round((found.length / results.length) * 100) : 0,
      website_emails_found: results.filter(r => r.website_email).length,
      sources,
      businesses:  results,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
