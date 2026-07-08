/**
 * Company Intel engine.
 *
 * Turns a business email into a structured company profile for the client card:
 * pulls the company's website, has Claude summarize what they do, and frames it
 * for a franchise-consulting rep (scale + capital signals). Results are cached
 * in the `company_intel` table keyed by domain, so we never re-research the same
 * domain twice.
 *
 * Deliberately resilient: every function swallows its own errors and returns a
 * status instead of throwing, so it is always safe to call fire-and-forget from
 * a lead-ingest path.
 */

// Consumer / free mailbox providers — leads on these have no "company" to research.
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
  'protonmail.com', 'pm.me', 'gmx.com', 'zoho.com', 'mail.com', 'comcast.net',
  'att.net', 'sbcglobal.net', 'verizon.net', 'bellsouth.net', 'cox.net', 'charter.net',
  'earthlink.net', 'ptd.net', 'example.com', 'test.com',
]);

export function extractDomain(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.trim().toLowerCase().split('@');
  if (at.length !== 2 || !at[1].includes('.')) return null;
  return at[1].replace(/^www\./, '');
}

export function isBusinessDomain(domain) {
  return !!domain && !FREEMAIL.has(domain);
}

export function isBusinessEmail(email) {
  return isBusinessDomain(extractDomain(email));
}

// Fetch a URL with a hard timeout; returns text or null (never throws).
async function fetchWithTimeout(url, ms, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KansoBot/1.0; +https://www.trykanso.co)' },
      ...opts,
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Very light HTML → text: drop script/style, strip tags, collapse whitespace.
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull the homepage (and /about if quick) and return a trimmed text blob.
async function fetchSiteText(domain) {
  let html = await fetchWithTimeout(`https://${domain}`, 8000);
  if (!html) html = await fetchWithTimeout(`http://${domain}`, 6000);
  if (!html) return null;

  let text = htmlToText(html);

  // Grab an About page too when the homepage is thin — that's where the story lives.
  if (text.length < 1200) {
    for (const path of ['/about', '/about-us']) {
      const more = await fetchWithTimeout(`https://${domain}${path}`, 5000);
      if (more) { text += ' ' + htmlToText(more); break; }
    }
  }

  return text.slice(0, 8000) || null;
}

// Ask Claude to summarize the company through a franchise-consulting lens.
async function summarizeCompany(domain, siteText) {
  const prompt = `You are a research assistant for a franchise-consulting firm. A lead just came in from the business domain "${domain}". Below is text scraped from their website. Summarize the business for a sales rep evaluating this person as a potential franchise buyer.

Return ONLY valid JSON — no markdown, no code fences, no explanation. Use this exact structure:
{
  "company_name": "company name or empty string",
  "what_they_do": "1-2 plain sentences on what the business does",
  "industry": "short industry label",
  "category": "more specific category, or empty string",
  "services": ["service or product"],
  "company_size": "solo | small | mid | large | unknown",
  "location": "city, state or empty string",
  "owner_name": "owner/founder full name if clearly stated, else empty string",
  "owner_title": "their title if stated, else empty string",
  "scale_signals": ["concrete signals of scale: # locations, employees, revenue, press, franchising, etc."],
  "capital_signal": "low | medium | high | unknown  (likely liquid capital / buying power of this lead)",
  "franchise_read": "1-2 sentences: how a franchise-consulting rep should read this lead — sophistication, operator profile, how to approach"
}

If the website text is empty or unhelpful, return the structure with empty strings/arrays and capital_signal "unknown".

Website text:
${siteText || '(no website text available)'}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  let raw = data?.content?.[0]?.text?.trim() || '';
  // Strip accidental code fences (mirrors the sync-granola extraction fix).
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(raw);
}

/**
 * Enrich one contact's company and upsert it into `company_intel`.
 * Safe to call fire-and-forget. Returns the stored row (or a status object).
 *
 * @param {{ email:string, ghlContactId?:string, leadId?:string, supabase:object, force?:boolean }} args
 */
export async function runCompanyIntel({ email, ghlContactId = null, leadId = null, supabase, force = false }) {
  try {
    const domain = extractDomain(email);
    if (!domain) return { status: 'skipped', reason: 'no_domain' };

    if (!isBusinessDomain(domain)) {
      return { status: 'freemail', domain };
    }

    // Cache hit — don't re-research a domain we already know (unless forced).
    if (!force) {
      const { data: existing } = await supabase
        .from('company_intel').select('*').eq('domain', domain).maybeSingle();
      if (existing && existing.status === 'ok') return { status: 'cached', row: existing };
    }

    const siteText = await fetchSiteText(domain);

    let summary = null;
    let status = 'ok';
    let errorMsg = null;
    if (!siteText) {
      status = 'no_site';
    } else {
      try {
        summary = await summarizeCompany(domain, siteText);
      } catch (e) {
        status = 'error';
        errorMsg = e.message;
      }
    }

    const row = {
      domain,
      ghl_contact_id: ghlContactId,
      lead_id: leadId,
      email: (email || '').toLowerCase(),
      website_url: `https://${domain}`,
      logo_url: `https://logo.clearbit.com/${domain}`,
      company_name: summary?.company_name || null,
      what_they_do: summary?.what_they_do || null,
      industry: summary?.industry || null,
      category: summary?.category || null,
      services: summary?.services || null,
      company_size: summary?.company_size || null,
      location: summary?.location || null,
      owner_name: summary?.owner_name || null,
      owner_title: summary?.owner_title || null,
      scale_signals: summary?.scale_signals || null,
      capital_signal: summary?.capital_signal || null,
      franchise_read: summary?.franchise_read || null,
      raw: summary || null,
      status,
      error: errorMsg,
      refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: upErr } = await supabase
      .from('company_intel')
      .upsert(row, { onConflict: 'domain' })
      .select()
      .single();

    if (upErr) return { status: 'error', reason: upErr.message };
    return { status, row: saved };
  } catch (e) {
    return { status: 'error', reason: e.message };
  }
}
