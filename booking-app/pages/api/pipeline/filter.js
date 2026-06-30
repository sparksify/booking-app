export const config = { maxDuration: 300 };

import { getSupabaseAdmin } from '@/lib/supabase';

// Phrases anywhere in the page (nav, body, footer) that signal franchise recruiting.
const FRANCHISE_NAV_PATTERNS = [
  'franchise',
  'own a business',
  'start your own',
  'open a location',
  'own your own',
  'become a franchisee',
  'franchise opportunit',
  'franchise development',
  'franchise disclosure',
  'territories available',
  'territory available',
  'available territories',
  'available territory',
  'protected territory',
  'exclusive territory',
];

// Generic "Own a/an [Brand]" nav-link pattern — catches "Own an ISI®" for any brand,
// no hardcoded names needed.
const OWN_BRAND_RE = /\bown\s+(a|an|your\s+own)\b[^.<>\n]{0,40}/i;

// "territory/territories ... available" even when not an exact phrase match above
const TERRITORY_RE = /\bterritor(y|ies)\b[^.<>\n]{0,60}\bavailable\b|\bavailable\b[^.<>\n]{0,60}\bterritor(y|ies)\b/i;

// Multi-location URL structure is itself a franchise signal
const LOCATION_URL_RE = /\/locations?\/|\/gyms\/|\/studios\/|\/stores\//i;

function matchesLocationUrl(website) {
  return !!(website && LOCATION_URL_RE.test(website));
}

// CRITICAL: this runs against the FULL, UNTRUNCATED HTML. Real-world sites — especially
// WordPress/Divi/Elementor sites, which is exactly what franchise brands like ISI and
// SWEAT440 run on — can have 30,000+ characters of <head> content (fonts, JSON-LD schema,
// inline CSS, minified JS) before the nav bar even appears in the document. Truncating
// before this check runs was silently cutting off the word "Franchise" in the nav before
// we ever looked for it. This must run on the full page, every time.
function quickFranchiseCheck(html) {
  const lower = html.toLowerCase();
  if (FRANCHISE_NAV_PATTERNS.some(p => lower.includes(p))) return true;
  if (OWN_BRAND_RE.test(html)) return true;
  if (TERRITORY_RE.test(html)) return true;
  return false;
}

// Fetch the FULL page, no truncation here. Truncation only happens later, and only for
// the slice we send to Claude (which has real token limits the keyword check doesn't).
async function fetchWebsite(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const html = await r.text();
    return html; // FULL page, untruncated
  } catch (e) { return null; }
}

// Pull out just the <nav>, <header>, and <footer> regions if present — this is where
// franchise nav links live, and isolating them means we can hand a much smaller, more
// relevant slice to Claude instead of guessing at a fixed character truncation point
// that might still miss the nav on an unusually long page.
function extractNavAndFooter(html) {
  const regions = [];
  const navMatches = html.match(/<nav[\s\S]{0,8000}?<\/nav>/gi) || [];
  const headerMatches = html.match(/<header[\s\S]{0,8000}?<\/header>/gi) || [];
  const footerMatches = html.match(/<footer[\s\S]{0,8000}?<\/footer>/gi) || [];
  regions.push(...navMatches, ...headerMatches, ...footerMatches);
  return regions.join('\n\n');
}

async function checkSiblingFranchisePages(website) {
  try {
    const u = new URL(website);
    const base = `${u.protocol}//${u.hostname}`;
    const candidates = [base, `${base}/franchise`, `${base}/franchising`, `${base}/own-a-franchise`];
    for (const url of candidates) {
      const html = await fetchWebsite(url);
      if (html && quickFranchiseCheck(html)) return true;
    }
  } catch (e) { /* fall through */ }
  return false;
}

async function claudeFranchiseCheck(businessName, html) {
  try {
    // For the AI fallback, prefer the isolated nav/header/footer regions (small, relevant)
    // over a blind truncation of the full page. Fall back to a larger truncated slice
    // only if no nav/header/footer regions were found at all.
    const navRegions = extractNavAndFooter(html);
    const contentForAI = navRegions && navRegions.length > 200
      ? navRegions.slice(0, 15000)
      : html.slice(0, 15000);

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
          content: `You are checking whether a business is already a franchise system (i.e. they franchise TO others, or are a location of a national/regional franchise brand).

Look for: navigation links or page text mentioning franchise opportunities, becoming a franchisee, owning a franchise location, franchise development, franchise disclosure documents (FDD), "own a [brand]" language, or "territories available" language. Also consider whether the business name and branding suggest a multi-location national chain even if this specific excerpt doesn't mention franchising directly.

Business: ${businessName}
Page navigation/header/footer HTML (these are the regions most likely to contain a "Franchise" nav link):
${contentForAI}

Reply with ONLY one word: FRANCHISE or INDEPENDENT`,
        }],
      }),
    });
    const d = await r.json();
    const answer = d.content?.[0]?.text?.trim().toUpperCase();
    return answer === 'FRANCHISE';
  } catch (e) { return false; }
}

async function saveFranchise(biz, franchiseCheck) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('pipeline_franchises').insert({
      business_name:   biz.business_name,
      city:            biz.city,
      industry:        biz.industry,
      website:         biz.website,
      domain:          biz.domain,
      phone:           biz.phone || null,
      rating:          biz.rating || null,
      review_count:    biz.review_count || null,
      address:         biz.address || null,
      place_id:        biz.place_id || null,
      franchise_check: franchiseCheck,
    });
  } catch (e) {
    console.error('Failed to save franchise:', e.message);
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

  // Keyword check on the FULL untruncated page — this is the actual fix.
  if (quickFranchiseCheck(html)) {
    await saveFranchise(biz, 'keyword_match');
    return { ...biz, is_franchise: true, franchise_check: 'keyword_match' };
  }

  // If the URL itself looks like a location/gym/studio subpage, also check sibling pages
  // (root, /franchise) before trusting that it's independent.
  if (matchesLocationUrl(website)) {
    const siblingMatch = await checkSiblingFranchisePages(website);
    if (siblingMatch) {
      await saveFranchise(biz, 'sibling_page_match');
      return { ...biz, is_franchise: true, franchise_check: 'sibling_page_match' };
    }
  }

  const isFranchise = await claudeFranchiseCheck(business_name, html);
  if (isFranchise) {
    await saveFranchise(biz, 'claude_detected');
  }
  return {
    ...biz,
    is_franchise: isFranchise,
    franchise_check: isFranchise ? 'claude_detected' : 'claude_clear',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    const results = await Promise.all(businesses.map(biz => checkOne(biz)));
    const passed   = results.filter(b => !b.is_franchise);
    const filtered = results.filter(b => b.is_franchise);

    return res.status(200).json({
      total:               results.length,
      passed:              passed.length,
      filtered:            filtered.length,
      filter_rate:         results.length > 0 ? Math.round((filtered.length / results.length) * 100) : 0,
      businesses:          passed,
      filtered_businesses: filtered,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
