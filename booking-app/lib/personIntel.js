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

// Pull any explicit email addresses out of free text (for a stray fallback).
function firstLine(s) { return String(s || '').split('\n')[0].trim(); }

function buildPrompt({ name, email, phone, company, location }) {
  const domain = extractDomain(email);
  const knowns = [
    name    && `Name: ${name}`,
    email   && `Email: ${email}`,
    phone   && `Phone: ${phone}`,
    company && `Company/website: ${company}`,
    domain && isBusinessDomain(domain) && `Email domain: ${domain}`,
    location && `Location: ${location}`,
  ].filter(Boolean).join('\n');

  return `You are a research assistant for a franchise-consulting firm. Build a factual dossier on the PERSON below, who is a sales prospect (they submitted an inquiry about buying a franchise). Search the open web — LinkedIn, company sites, news, business filings, directories, press, podcasts, social profiles — and report only what you can actually find on real pages.

Known details:
${knowns || '(only a name is known)'}

Rules:
- Use the known details together to disambiguate the right person (same email domain, company, city). If you are not confident it's the same individual, say so and keep confidence low. Never merge two different people.
- Report only facts stated on real, findable pages. Do NOT guess, invent, or infer. If you don't find something, leave it empty.
- Do not report sensitive personal matters (health, religion, sexual orientation, political affiliation, family details, anything about minors). Keep it to professional and business-relevant public information.
- "capital_signal" is your read of likely buying power / liquid capital based on career level, business ownership, and public signals — not a hard number.

Return ONLY valid JSON — no markdown, no code fences, no commentary. Use exactly this structure:
{
  "full_name": "the person's full name, or empty string",
  "headline": "one short line: who they are (e.g. 'Owner of a 3-location HVAC company in Dallas')",
  "summary": "2-4 plain sentences summarizing who this person is, professionally",
  "current_role": "current title, or empty string",
  "employer": "current company/employer, or empty string",
  "location": "city, state or empty string",
  "background": ["notable past roles, companies, or career history — one item each"],
  "business_interests": ["businesses they own, invest in, or are involved with"],
  "capital_signal": "low | medium | high | unknown",
  "online_presence": [{"type": "LinkedIn | Company | News | Social | Other", "label": "short label", "url": "https://..."}],
  "notable_facts": ["concrete, verifiable facts relevant to a franchise sales rep"],
  "franchise_read": "2-3 sentences: how a franchise-consulting rep should read and approach this person",
  "confidence": "low | medium | high",
  "sources": ["https://... URLs you actually used"]
}

If you can find almost nothing about this specific person, return the structure with empty strings/arrays, capital_signal "unknown", and confidence "low".`;
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
      model: 'perplexity/sonar',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1200,
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
  email = null, name = null, phone = null, company = null, location = null,
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

    let dossier = null, citations = [], status = 'ok', errorMsg = null;
    try {
      const out = await callPerplexity(buildPrompt({ name, email, phone, company, location }));
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
