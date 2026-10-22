export const config = { maxDuration: 300 };

import { identifyOwner } from '@/lib/pipeline/identifyOwner.mjs';
import { candidatesFromMention } from '@/lib/pipeline/ownerGate.mjs';
import { filingsOwner, mapsPlaceOwner, perplexityOwner, pressOwner } from '@/lib/pipeline/nameSources.js';
import { requirePipelineAccess } from '@/lib/scout/auth';

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

3. ROLE: owner, founder, or managing partner. If the person is staff, return NOT_FOUND for the owner.
4. PHONE: A direct or owner phone stated on the page. If you only see a generic front-desk number, return NOT_FOUND.

Return ONLY valid JSON, no markdown:
{"owner":"Full Name or Name1 and Name2 or NOT_FOUND","role":"owner or founder or managing partner or NOT_FOUND","phone":"or NOT_FOUND","signal":"Notable fact or NOT_FOUND"}`,
        }],
      }),
    });
    const d = await r.json();
    const text = d.content?.[0]?.text?.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    const value = key => parsed[key] && parsed[key] !== 'NOT_FOUND' ? parsed[key] : null;
    return { owner: value('owner'), signal: value('signal'), role: value('role'), phone: value('phone') };
  } catch (e) { return { owner: null, signal: null }; }
}

function htmlExcerpt(html) {
  if (!html) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 1200) : null;
}

async function findOwnerOnWebsite(businessName, website, domain, readPage = fetchPage) {
  if (!website) return { owner: null, signal: null, emails: [], calls: [] };
  let base;
  try {
    const u = new URL(website);
    base = `${u.protocol}//${u.hostname}`;
  } catch (e) { return { owner: null, signal: null, emails: [], calls: [] }; }

  const urls = [website, ...OWNER_PAGE_SLUGS.map(slug => `${base}/${slug}`)];
  let owner = null, signal = null, role = null, phone = null, ownerUrl = null, excerpt = null;
  const emailSet = new Set();
  let pagesChecked = 0;
  let claudeCalls = 0;

  for (const url of urls) {
    if (pagesChecked >= 6) break;
    const html = await readPage(url);
    if (!html) continue;
    pagesChecked++;
    if (!excerpt) excerpt = htmlExcerpt(html);
    harvestEmails(html).forEach(email => emailSet.add(email));

    if (!owner || !signal) {
      claudeCalls++;
      const result = await extractOwnerAndSignal(businessName, html);
      if (result.owner && !owner) {
        owner = result.owner;
        ownerUrl = url;
        role = result.role;
        phone = result.phone;
        excerpt = htmlExcerpt(html) || excerpt;
      }
      if (result.signal && !signal) signal = result.signal;
    }

    if (owner && signal && emailSet.size) break;
  }

  return {
    owner, role, phone, url: ownerUrl, signal, excerpt,
    emails: rankEmails([...emailSet], domain),
    calls: claudeCalls ? [{ finder: 'claude_haiku_site', stage: 'name', credits: claudeCalls }] : [],
  };
}

async function readSite(biz, readPage) {
  const site = await findOwnerOnWebsite(biz.business_name, biz.website, biz.domain, readPage);
  return {
    emails: site.emails,
    excerpt: site.excerpt,
    signal: site.signal,
    calls: site.calls,
    candidates: candidatesFromMention(site.owner, { category: 'site', url: site.url, role: site.role, phone: site.phone }),
  };
}

export async function discoverOne(biz, { readPage = fetchPage } = {}) {
  const existingOwner = biz.owner_name || biz.owner;
  const offline = !process.env.SERP_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY;
  if (!biz.website && offline) {
    const signalBase = biz.rating && biz.review_count ? `${biz.rating} stars across ${biz.review_count} reviews on Google` : null;
    return {
      ...biz,
      owner_name: existingOwner || null,
      owner_source: existingOwner ? 'provided' : 'not_found',
      owner_confidence: 'low',
      signal: biz.signal || signalBase,
      website_email: null,
      website_emails: [],
      website_excerpt: null,
    };
  }
  return identifyOwner(biz, {
    readSite: business => readSite(business, readPage),
    mapsPlace: mapsPlaceOwner,
    press: pressOwner,
    filings: filingsOwner,
    perplexity: perplexityOwner,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requirePipelineAccess(req, res)) return;
  const { businesses } = req.body || {};
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    const results = await Promise.all(businesses.map(biz => discoverOne(biz)));
    const found   = results.filter(r => r.owner_name);

    const counted = category => results.filter(r => (r.owner_sources || []).includes(category) || r.owner_source === category).length;
    const sources = {
      site: counted('site'),
      maps: counted('maps'),
      press: counted('press'),
      filings_linkedin: counted('filings_linkedin'),
      perplexity: counted('perplexity'),
      confirmed: results.filter(r => r.owner_confidence === 'medium' || r.owner_confidence === 'high').length,
      not_found: results.filter(r => r.owner_source === 'not_found' || !r.owner_name).length,
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
