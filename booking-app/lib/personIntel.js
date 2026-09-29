/**
 * Person Intel engine — the "secret agent" for an individual lead.
 *
 * Given a lead's name (plus whatever we know: email, phone, company, location),
 * asks Perplexity Sonar (via OpenRouter) to search the open web and assemble a
 * factual dossier for a franchise-consulting rep: who they are, what they do,
 * their background, buying-power signals, online presence, and how to approach
 * them. Results are cached in the `person_intel` table keyed by email so we
 * never re-run the same person for free.
 *
 * Deliberately resilient: every path swallows its own errors and returns a
 * status object instead of throwing, so it's always safe to call.
 */

import { extractDomain, isBusinessDomain } from './companyIntel';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const SERP_API_KEY   = process.env.SERP_API_KEY;

// Pull any explicit email addresses out of free text (for a stray fallback).
function firstLine(s) { return String(s || '').split('\n')[0].trim(); }

// Phone → the common written formats, so an exact-match Google query hits the
// page (business listing, site footer) where the number actually appears.
function phoneVariants(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  const ten = d.length > 10 ? d.slice(-10) : d;
  if (ten.length !== 10) return [];
  const a = ten.slice(0, 3), b = ten.slice(3, 6), c = ten.slice(6);
  return [`${a}-${b}-${c}`, `(${a}) ${b}-${c}`, ten];
}

// One SerpAPI Google query → [{title, link, snippet}] (never throws).
async function serpSearch(query) {
  if (!SERP_API_KEY) return [];
  try {
    const params = new URLSearchParams({ engine: 'google', q: query, num: '10', api_key: SERP_API_KEY });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.organic_results || [])
      .filter(o => o.link)
      .map(o => ({ title: o.title || '', link: o.link, snippet: o.snippet || '' }));
  } catch { return []; }
}

// Reverse-look-up the phone number and name on real Google. The phone-number
// hit is the key that usually names the person's actual company.
async function gatherSearchContext({ name, phone, email, company, location }) {
  if (!SERP_API_KEY) return [];
  const domain = extractDomain(email);
  const queries = [];
  for (const v of phoneVariants(phone)) queries.push(`"${v}"`);
  if (name && location) queries.push(`"${name}" ${location}`);
  if (name)             queries.push(`"${name}" (owner OR founder OR president OR CEO OR LinkedIn)`);
  if (name && domain && isBusinessDomain(domain)) queries.push(`"${name}" ${domain}`);
  if (company)          queries.push(`"${company}" "${name || ''}"`.trim());

  const results = await Promise.all(queries.map(serpSearch));
  const seen = new Set();
  const findings = [];
  for (const f of results.flat()) {
    if (!f.link || seen.has(f.link)) continue;
    seen.add(f.link);
    findings.push(f);
  }
  return findings.slice(0, 18);
}

function buildPrompt({ name, email, phone, company, location, brand, findings = [] }) {
  const domain = extractDomain(email);
  const knowns = [
    name    && `Name: ${name}`,
    phone   && `Phone: ${phone}   ← STRONGEST identifier — reverse-look this up first`,
    email   && `Email: ${email}`,
    company && `Company/website: ${company}`,
    domain && isBusinessDomain(domain) && `Email domain: ${domain}`,
    location && `Location: ${location}`,
  ].filter(Boolean).join('\n');

  const brandLine = brand
    ? `The person submitted an inquiry about the franchise brand "${brand}". Judge how strong a fit they are for THAT specific brand, given their real background.`
    : `The person submitted a franchise inquiry. Judge how strong a fit they are as a franchise buyer, given their real background.`;

  const searchBlock = findings.length
    ? `\nREAL GOOGLE RESULTS — from reverse-looking-up the phone number and name (use these as PRIMARY evidence; the phone-number hit usually names their company). Read the snippets and connect them:\n${findings.map((f, i) => `[${i + 1}] ${f.title}\n${f.link}\n${f.snippet}`).join('\n\n')}\n`
    : '';

  return `You are an elite research analyst for a franchise-consulting firm. Your job: figure out who this PERSON REALLY is, then how good a lead they are. Search the open web — reverse phone/number lookups, business listings, LinkedIn, company sites, state business filings, news, directories, press.

Known details (use ALL of them together to triangulate — never rely on the name alone, names are ambiguous):
${knowns || '(only a name is known)'}
${searchBlock}
Identification method — follow this order:
1. The PHONE NUMBER is the single strongest unique identifier. Reverse-look it up: what business, listing, or person is this exact number publicly tied to? This usually resolves their actual company — start here.
2. Then the email domain (if it's a company domain), then name + location. Cross-connect these signals.
3. Connecting entities across different pages is valid and expected: if the phone number publicly belongs to "Acme Co" and a person by this name is publicly tied to "Acme Co" in the same metro, treat that as a STRONG (not certain) match — and say exactly which page tied what to what. A phone→company link plus a name→company link is strong evidence even when no single page states all of it.
4. Never merge two clearly different people. If several candidates exist, choose the one the phone/company/location points to, and note the discarded ones in one line.

Report only facts found on real, findable pages — do not invent. Skip sensitive personal matters (health, religion, politics, family, minors). Keep it professional and business-relevant.

${brandLine}

Return ONLY valid JSON — no markdown, no code fences, no commentary. Exactly this structure:
{
  "full_name": "the person's full name, or empty string",
  "headline": "one line: who they really are, e.g. 'Owner of Green Pine Recycling, an Atlanta waste-brokerage firm'",
  "summary": "3-5 sentences: who they are AND the connective evidence for the identity match (name the phone→company link if that's how you found them)",
  "current_role": "current title/role, or empty string",
  "employer": "current company, or empty string",
  "location": "city, state or empty string",
  "background": ["notable roles / companies / career history — one per item"],
  "business_interests": ["businesses they own, run, or are tied to"],
  "capital_signal": "low | medium | high | unknown  (likely buying power)",
  "relevance": "high | medium | low  (how strong a fit for the brand above)",
  "relevance_reason": "1-2 sentences: WHY they are or aren't a fit for that brand, given their background and industry",
  "online_presence": [{"type": "LinkedIn | Company | News | Social | Other", "label": "short label", "url": "https://..."}],
  "notable_facts": ["concrete facts a rep should know, each ideally tied to a source"],
  "franchise_read": "2-4 sentences: how the rep should approach THIS person for THIS brand — the angle, what they already understand, what to open with",
  "confidence": "low | medium | high  (identity-match confidence)",
  "sources": ["https://... URLs you actually used"]
}

If you genuinely cannot identify the person, return empty strings/arrays with capital_signal "unknown", relevance "low", confidence "low".`;
}

// Call Perplexity Sonar via OpenRouter. Returns { parsed, citations } or throws.
async function callPerplexity(prompt) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'X-Title': 'KANSO Person Intel',
    },
    body: JSON.stringify({
      // sonar-pro is a much stronger search+synthesis model than base sonar —
      // it does the multi-hop "phone → company → person → fit" reasoning.
      model: process.env.PERSON_INTEL_MODEL || 'perplexity/sonar-pro',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2200,
      temperature: 0.2,
    }),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`OpenRouter ${r.status}: ${detail.slice(0, 200)}`);
  }

  const data = await r.json();
  let raw = data?.choices?.[0]?.message?.content?.trim() || '';
  // Perplexity/OpenRouter returns web citations alongside the message.
  const citations = Array.isArray(data?.citations) ? data.citations
    : (Array.isArray(data?.choices?.[0]?.message?.annotations)
        ? data.choices[0].message.annotations.map(a => a?.url_citation?.url).filter(Boolean)
        : []);

  // Strip accidental code fences, then isolate the JSON object.
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`no JSON in model output: ${firstLine(raw).slice(0, 120)}`);
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return { parsed, citations };
}

/**
 * Research one person and upsert into `person_intel`. Keyed by email.
 *
 * @param {{ email?:string, name?:string, phone?:string, company?:string,
 *           location?:string, ghlContactId?:string, leadId?:string,
 *           supabase:object, force?:boolean }} args
 */
export async function runPersonIntel({
  email = null, name = null, phone = null, company = null, location = null, brand = null,
  ghlContactId = null, leadId = null, supabase, force = false,
}) {
  try {
    const key = (email || '').trim().toLowerCase() || null;
    if (!key && !name) return { status: 'skipped', reason: 'no_identifier' };
    if (!OPENROUTER_KEY) return { status: 'error', reason: 'OPENROUTER_API_KEY not set' };

    // Cache hit — don't re-research (unless forced).
    if (!force && key) {
      const { data: existing } = await supabase
        .from('person_intel').select('*').eq('email', key).maybeSingle();
      if (existing && existing.status === 'ok') return { status: 'cached', row: existing };
    }

    // Reverse-look-up the phone + name on real Google first, so the model starts
    // from the page that actually names their company instead of guessing.
    const findings = await gatherSearchContext({ name, phone, email, company, location });

    let dossier = null, citations = [], status = 'ok', errorMsg = null;
    try {
      const out = await callPerplexity(buildPrompt({ name, email, phone, company, location, brand, findings }));
      dossier   = out.parsed;
      citations = out.citations;
    } catch (e) {
      status = 'error';
      errorMsg = e.message;
    }

    // Merge model-declared sources with the provider's own citations.
    const sources = [...new Set([
      ...(Array.isArray(dossier?.sources) ? dossier.sources : []),
      ...citations,
    ].filter(Boolean))];

    const row = {
      email: key,
      lead_id: leadId,
      ghl_contact_id: ghlContactId,
      full_name:          dossier?.full_name || name || null,
      headline:           dossier?.headline || null,
      summary:            dossier?.summary || null,
      current_title:      dossier?.current_role || null,
      employer:           dossier?.employer || null,
      relevance:          dossier?.relevance || null,
      relevance_reason:   dossier?.relevance_reason || null,
      location:           dossier?.location || location || null,
      background:         dossier?.background || null,
      business_interests: dossier?.business_interests || null,
      capital_signal:     dossier?.capital_signal || 'unknown',
      online_presence:    dossier?.online_presence || null,
      notable_facts:      dossier?.notable_facts || null,
      franchise_read:     dossier?.franchise_read || null,
      confidence:         dossier?.confidence || 'low',
      sources:            sources.length ? sources : null,
      raw:                dossier || null,
      status,
      error: errorMsg,
      refreshed_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };

    if (!key) {
      // No email to key the cache on — return the fresh result without persisting.
      return { status, row };
    }

    const { data: saved, error: upErr } = await supabase
      .from('person_intel')
      .upsert(row, { onConflict: 'email' })
      .select()
      .single();

    if (upErr) return { status: 'error', reason: upErr.message, row };
    return { status, row: saved };
  } catch (e) {
    return { status: 'error', reason: e.message };
  }
}
