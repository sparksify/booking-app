export const config = { maxDuration: 300 };

import { getSupabaseAdmin } from '@/lib/supabase';
import { requirePipelineAccess } from '@/lib/scout/auth';
import { classifierConfirmsFranchise, franchiseBrandRow, pageFranchiseEvidence } from '@/lib/pipeline/franchiseGate.mjs';
import { saveFranchiseBrand } from '@/lib/pipeline/franchiseStore.js';

// A location-style URL is not a franchise by itself. It prompts a look at /franchise.
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
  return pageFranchiseEvidence(html);
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
      if (html && quickFranchiseCheck(html)) return url;
    }
  } catch (e) { /* fall through */ }
  return null;
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
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Decide whether this business offers franchises or is a unit of a franchise system.

Call it a franchise ONLY when the page itself shows one of these:
- a Franchise Disclosure Document or FDD
- a franchise, franchising, or franchisee page or offer
- a franchisor or franchising entity
- territories available for sale

The business name, a multi-location feeling, or "own a business" language is NOT enough. If the page does not contain that evidence, answer INDEPENDENT.

Business: ${businessName}
Page text:
${contentForAI}

Return ONLY JSON:
{"decision":"FRANCHISE or INDEPENDENT","evidence":"exact quote copied from the page, or empty"}`,
        }],
      }),
    });
    const d = await r.json();
    return classifierConfirmsFranchise(html, d.content?.[0]?.text || '');
  } catch (e) { return { franchise: false, evidence: null }; }
}

export async function checkOne(biz) {
  const { business_name, website } = biz;

  if (!website) {
    return { ...biz, is_franchise: false, franchise_check: 'no_website' };
  }

  const html = await fetchWebsite(website);
  if (!html) {
    return { ...biz, is_franchise: false, franchise_check: 'fetch_failed' };
  }

  const pageEvidence = quickFranchiseCheck(html);
  if (pageEvidence) {
    return {
      ...biz,
      is_franchise: true,
      franchise_check: 'keyword_match',
      franchise_evidence_kind: 'page',
      franchise_evidence_url: website,
      franchise_evidence_detail: pageEvidence.detail,
      franchise_confidence: 'high',
    };
  }

  // A location URL is not itself a franchise. A sibling /franchise page is.
  if (matchesLocationUrl(website)) {
    const siblingUrl = await checkSiblingFranchisePages(website);
    if (siblingUrl) {
      return {
        ...biz,
        is_franchise: true,
        franchise_check: 'sibling_page_match',
        franchise_evidence_kind: 'page',
        franchise_evidence_url: siblingUrl,
        franchise_evidence_detail: 'franchise page',
        franchise_confidence: 'high',
      };
    }
  }

  const claude = await claudeFranchiseCheck(business_name, html);
  if (claude.franchise) {
    return {
      ...biz,
      is_franchise: true,
      franchise_check: 'claude_detected',
      franchise_evidence_kind: 'classifier',
      franchise_evidence_url: website,
      franchise_evidence_detail: claude.evidence,
      franchise_confidence: 'medium',
    };
  }
  return { ...biz, is_franchise: false, franchise_check: 'claude_clear' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requirePipelineAccess(req, res)) return;
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    const results = await Promise.all(businesses.map(biz => checkOne(biz)));
    const passed   = results.filter(b => !b.is_franchise);
    const filtered = results.filter(b => b.is_franchise);
    const db = getSupabaseAdmin();
    for (const biz of filtered) {
      try { await saveFranchiseBrand(db, franchiseBrandRow(biz)); }
      catch (error) { console.error('Failed to save franchise brand:', error.message); }
    }

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
