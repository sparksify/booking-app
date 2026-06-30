export const config = { maxDuration: 290 };

const ANYMAIL_KEY     = process.env.ANYMAIL_FINDER_API_KEY;
const FULLENRICH_KEY  = process.env.FULLENRICH_API_KEY;
const PROSPEO_KEY     = process.env.PROSPEO_API_KEY;
const MV_KEY          = process.env.MILLIONVERIFIER_API_KEY;
const SERP_API_KEY    = process.env.SERP_API_KEY;
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;

function parseOwnerNames(ownerName) {
  if (!ownerName) return [];
  return ownerName
    .split(/\s+and\s+|\s*&\s*|,\s*/i)
    .map(n => n.trim())
    .filter(Boolean);
}

function hasFullName(name) {
  if (!name) return false;
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 && parts[1].length > 1;
}

function pickOwner(names) {
  return names.find(hasFullName) || names[0] || null;
}

async function verifyEmail(email) {
  if (!email) return 'reject';
  if (!MV_KEY) return 'unchecked';
  try {
    const params = new URLSearchParams({ api: MV_KEY, email, timeout: '10' });
    const r = await fetch(`https://api.millionverifier.com/api/v3/?${params}`);
    const d = await r.json();
    if (d.result === 'ok')        return 'ok';
    if (d.result === 'catch_all') return 'catch_all';
    return 'reject';
  } catch (e) {
    return 'unchecked';
  }
}

// ── Email extraction helpers, shared by both search-based stages ──

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_JUNK = /(example\.(com|org)|sentry|wixpress|\.png|\.jpe?g|\.gif|\.svg|\.webp|@2x|no-?reply|noreply|donotreply|godaddy|squarespace|wordpress|cloudflare|yourdomain|domain\.com|email\.com|sentry\.io|\.css|\.js$)/i;
const EMAIL_ROLE = /^(info|contact|hello|admin|sales|support|office|booking|bookings|reservations|reserve|hi|team|mail|enquiries|inquiries|help|jobs|careers|press|media|marketing|accounts|billing|orders|catering|concierge)@/i;

function extractEmails(text) {
  if (!text) return [];
  const found = [...new Set((text.match(EMAIL_RE) || []).map(e => e.toLowerCase().replace(/\.$/, '')))];
  return found.filter(e => !EMAIL_JUNK.test(e) && e.length < 60);
}

function rankExtractedEmails(emails, domain) {
  const d = (domain || '').toLowerCase();
  return [...new Set(emails)].sort((a, b) => {
    const ad = d && a.endsWith('@' + d) ? 0 : 1;
    const bd = d && b.endsWith('@' + d) ? 0 : 1;
    if (ad !== bd) return ad - bd;
    const ar = EMAIL_ROLE.test(a) ? 1 : 0;
    const br = EMAIL_ROLE.test(b) ? 1 : 0;
    return ar - br;
  });
}

// ── Stage A: SerpAPI Google search (AI Overview + organic snippets) ──
// Opportunistic — catches real, already-indexed emails when Google happens to
// surface them. Not reliable on every query, but free and zero downside.

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

async function serpSearchForEmail(query) {
  if (!SERP_API_KEY) return [];
  try {
    const params = new URLSearchParams({ engine: 'google', q: query, num: '10', api_key: SERP_API_KEY });
    const r = await fetch(`https://serpapi.com/search?${params}`);
    if (!r.ok) return [];
    const data = await r.json();

    const text = [];

    if (data.ai_overview) {
      const directText = extractAiOverviewText(data.ai_overview);
      if (directText) {
        text.push(directText);
      } else if (data.ai_overview.page_token) {
        const followUp = await fetchAiOverviewPageToken(data.ai_overview.page_token);
        if (followUp) text.push(followUp);
      }
    }

    if (data.answer_box?.answer)  text.push(data.answer_box.answer);
    if (data.answer_box?.snippet) text.push(data.answer_box.snippet);
    if (data.knowledge_graph?.description) text.push(data.knowledge_graph.description);

    (data.organic_results || []).forEach(r => {
      if (r.snippet) text.push(r.snippet);
      if (r.title) text.push(r.title);
      if (r.rich_snippet?.top?.extensions) text.push(r.rich_snippet.top.extensions.join(' '));
    });

    return text;
  } catch (e) { return []; }
}

async function googleSearchEmail(ownerName, businessName, domain) {
  if (!SERP_API_KEY) return null;

  const queries = [
    ownerName ? `"${businessName}" "${ownerName}" email address` : null,
    ownerName ? `"${ownerName}" "${businessName}" contact email` : null,
    `"${businessName}" contact email`,
  ].filter(Boolean);

  const snippetArrays = await Promise.all(queries.map(q => serpSearchForEmail(q)));
  const allText = snippetArrays.flat().join('\n');
  const found = extractEmails(allText);
  if (!found.length) return null;

  return rankExtractedEmails(found, domain)[0] || null;
}

// ── Stage B: Perplexity (via OpenRouter) — independent search+synthesis path. ──
// Steve's own testing found Perplexity to be the strongest owner-name finder in
// the original Make.com build. This applies that same strength one step further:
// asking it directly for a real, already-existing email rather than constructing
// a probable one. Runs as a second, independent dice roll alongside SerpAPI —
// different model, different search/synthesis pipeline, so it's likely to catch
// a different slice of lucky hits, not just duplicate SerpAPI's misses.

async function perplexitySearchEmail(ownerName, businessName, domain, city) {
  if (!OPENROUTER_KEY) return null;
  try {
    const prompt = ownerName
      ? `Find the real, currently-active email address for ${ownerName}, who is the owner of "${businessName}" in ${city || 'the US'}. Search the web for this. Only return an email address if you find one stated explicitly on a real webpage (business listing, directory, article, social profile, etc.) — do not guess or construct one from a pattern. If you find one, reply with ONLY the email address, nothing else. If you cannot find a real, explicitly-stated email address, reply with exactly: NOT_FOUND`
      : `Find the real, currently-active contact email address for the business "${businessName}" in ${city || 'the US'}${domain ? ` (website: ${domain})` : ''}. Search the web for this. Only return an email address if you find one stated explicitly on a real webpage. If you find one, reply with ONLY the email address, nothing else. If you cannot find one, reply with exactly: NOT_FOUND`;

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
      }),
    });
    const d = await r.json();
    const text = d.choices?.[0]?.message?.content?.trim();
    if (!text || text.toUpperCase().includes('NOT_FOUND')) return null;

    const found = extractEmails(text);
    if (!found.length) return null;
    return rankExtractedEmails(found, domain)[0] || null;
  } catch (e) { return null; }
}

// ── Existing paid-vendor stages, unchanged ──

async function anymailPerson(name, domain) {
  if (!name || !domain || !ANYMAIL_KEY || !hasFullName(name)) return null;
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': ANYMAIL_KEY },
      body: JSON.stringify({ full_name: name, domain }),
    });
    const d = await r.json();
    return d.email || null;
  } catch (e) { return null; }
}

async function anymailCompany(businessName) {
  if (!businessName || !ANYMAIL_KEY) return null;
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': ANYMAIL_KEY },
      body: JSON.stringify({ full_name: 'owner', company_name: businessName }),
    });
    const d = await r.json();
    return d.email || null;
  } catch (e) { return null; }
}

async function prospeoLookup(firstName, lastName, businessName, domain) {
  if (!PROSPEO_KEY || !firstName || !lastName) return null;
  try {
    const r = await fetch('https://api.prospeo.io/email-finder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KEY': PROSPEO_KEY },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, company: businessName || domain || undefined }),
    });
    const d = await r.json();
    return d?.response?.email?.email || d?.response?.email || d?.email || null;
  } catch (e) { return null; }
}

async function fullEnrichLookup(firstName, lastName, domain, businessName) {
  if (!firstName || !lastName || !domain || !FULLENRICH_KEY) return { work: null, personal: null };
  try {
    const postRes = await fetch('https://app.fullenrich.com/api/v2/contact/enrich/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${FULLENRICH_KEY}` },
      body: JSON.stringify({
        name: `${firstName} ${lastName} @ ${domain}`,
        data: [{
          first_name: firstName,
          last_name:  lastName,
          domain,
          company_name: businessName || undefined,
          enrich_fields: ['contact.work_emails', 'contact.personal_emails'],
        }],
      }),
    });
    const postData = await postRes.json();
    const enrichmentId = postData.enrichment_id;
    if (!enrichmentId) return { work: null, personal: null };

    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const getRes  = await fetch(`https://app.fullenrich.com/api/v2/contact/enrich/bulk/${enrichmentId}`, {
        headers: { 'Authorization': `Bearer ${FULLENRICH_KEY}` },
      });
      const getData = await getRes.json();
      if (getData.status === 'FINISHED') {
        const ci = getData.data?.[0]?.contact_info || {};
        const work =
          ci.most_probable_work_email?.email ||
          ci.work_emails?.[0]?.email ||
          (typeof ci.work_emails?.[0] === 'string' ? ci.work_emails[0] : null) ||
          null;
        const personal =
          ci.most_probable_personal_email?.email ||
          ci.personal_emails?.[0]?.email ||
          (typeof ci.personal_emails?.[0] === 'string' ? ci.personal_emails[0] : null) ||
          null;
        return { work, personal };
      }
      if (['CANCELED', 'CREDITS_INSUFFICIENT'].includes(getData.status)) return { work: null, personal: null };
    }
    return { work: null, personal: null };
  } catch (e) { return { work: null, personal: null }; }
}

const PIPELINE_START = Date.now();
const MAX_BUDGET_MS = 250000;
function timeRemaining() { return MAX_BUDGET_MS - (Date.now() - PIPELINE_START); }

function mk(biz, email, owner, source, verification, loadable, holdReason, tried) {
  return {
    ...biz,
    email,
    email_owner: owner,
    email_source: source,
    verification,
    loadable,
    hold_reason: holdReason,
    enriched: true,
    enrichment_stages_tried: tried,
  };
}

async function enrichOne(biz) {
  const { owner_name, domain, business_name, city } = biz;
  const websiteEmails = biz.website_emails || (biz.website_email ? [biz.website_email] : []);
  const names = parseOwnerNames(owner_name);
  const tried = [];
  let heldCatchAll = null;

  // Stage 1 — website-harvested emails (free, from discover.js)
  for (const we of websiteEmails) {
    tried.push('website_email:' + we);
    const v = await verifyEmail(we);
    if (v === 'ok' || v === 'unchecked')
      return mk(biz, we, pickOwner(names), 'website_email', v, true, null, tried);
    if (v === 'catch_all' && !heldCatchAll)
      heldCatchAll = { email: we, owner: pickOwner(names), source: 'website_email' };
  }

  // Stage 2 — SerpAPI Google search (AI Overview + organic). Free, opportunistic.
  if (SERP_API_KEY) {
    tried.push('google_search_email');
    const searchEmail = await googleSearchEmail(pickOwner(names), business_name, domain);
    if (searchEmail) {
      const v = await verifyEmail(searchEmail);
      if (v === 'ok' || v === 'unchecked')
        return mk(biz, searchEmail, pickOwner(names), 'google_search_email', v, true, null, tried);
      if (v === 'catch_all' && !heldCatchAll)
        heldCatchAll = { email: searchEmail, owner: pickOwner(names), source: 'google_search_email' };
    }
  }

  // Stage 3 — Perplexity via OpenRouter. Independent search+synthesis path,
  // separate dice roll from SerpAPI. Free/cheap, opportunistic, never blocks.
  if (OPENROUTER_KEY) {
    tried.push('perplexity_search_email');
    const pplxEmail = await perplexitySearchEmail(pickOwner(names), business_name, domain, city);
    if (pplxEmail) {
      const v = await verifyEmail(pplxEmail);
      if (v === 'ok' || v === 'unchecked')
        return mk(biz, pplxEmail, pickOwner(names), 'perplexity_search_email', v, true, null, tried);
      if (v === 'catch_all' && !heldCatchAll)
        heldCatchAll = { email: pplxEmail, owner: pickOwner(names), source: 'perplexity_search_email' };
    }
  }

  // Stage 4 — Anymail person
  for (const name of names) {
    if (!hasFullName(name)) continue;
    tried.push('anymail_person:' + name);
    const email = await anymailPerson(name, domain);
    if (email) return mk(biz, email, name, 'anymail_person', 'skipped_verified_source', true, null, tried);
  }

  // Stage 5 — Prospeo
  if (PROSPEO_KEY) {
    for (const name of names) {
      if (!hasFullName(name)) continue;
      const parts = name.trim().split(/\s+/);
      tried.push('prospeo:' + name);
      const email = await prospeoLookup(parts[0], parts.slice(1).join(' '), business_name, domain);
      if (email) return mk(biz, email, name, 'prospeo', 'skipped_verified_source', true, null, tried);
    }
  }

  // Stage 6 — Anymail company guess
  tried.push('anymail_company');
  const companyEmail = await anymailCompany(business_name);
  if (companyEmail) {
    const v = await verifyEmail(companyEmail);
    if (v === 'ok' || v === 'unchecked')
      return mk(biz, companyEmail, null, 'anymail_company', v, true, null, tried);
    if (v === 'catch_all' && !heldCatchAll)
      heldCatchAll = { email: companyEmail, owner: null, source: 'anymail_company' };
  }

  // Stage 7 — FullEnrich (work + personal)
  if (FULLENRICH_KEY && domain && timeRemaining() > 20000) {
    for (const name of names) {
      if (!hasFullName(name)) continue;
      if (timeRemaining() < 20000) break;
      const parts = name.trim().split(/\s+/);
      tried.push('fullenrich:' + name);
      const fe = await fullEnrichLookup(parts[0], parts.slice(1).join(' '), domain, business_name);
      if (fe.work)
        return mk(biz, fe.work, name, 'fullenrich', 'skipped_verified_source', true, null, tried);
      if (fe.personal) {
        const v = await verifyEmail(fe.personal);
        if (v === 'ok' || v === 'unchecked')
          return mk(biz, fe.personal, name, 'fullenrich_personal', v, true, null, tried);
        if (v === 'catch_all' && !heldCatchAll)
          heldCatchAll = { email: fe.personal, owner: name, source: 'fullenrich_personal' };
      }
    }
  } else if (FULLENRICH_KEY && domain) {
    tried.push('fullenrich:skipped_budget');
  }

  if (heldCatchAll) {
    return mk(biz, heldCatchAll.email, heldCatchAll.owner, heldCatchAll.source, 'catch_all', false, 'catch_all', tried);
  }

  return { ...biz, email: null, email_owner: null, email_source: 'not_found', verification: null, loadable: false, hold_reason: null, enriched: false, enrichment_stages_tried: tried };
}

function normName(n) {
  return (n || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function applyOwnerGrouping(results) {
  const groups = {};
  results.forEach((r, i) => {
    const key = hasFullName(r.owner_name) ? normName(r.owner_name) : null;
    if (!key) return;
    (groups[key] = groups[key] || []).push(i);
  });

  for (const key of Object.keys(groups)) {
    const idxs = groups[key];
    if (idxs.length < 2) continue;

    let primaryIdx = idxs.find(i => results[i].loadable && results[i].email);
    if (primaryIdx === undefined) primaryIdx = idxs.find(i => results[i].email);
    if (primaryIdx === undefined) primaryIdx = idxs[0];

    const primary = results[primaryIdx];

    for (const i of idxs) {
      if (i === primaryIdx) {
        results[i].duplicate_owner = false;
        continue;
      }
      if (primary.email && !results[i].email) {
        results[i].email        = primary.email;
        results[i].email_owner  = primary.email_owner || results[i].owner_name;
        results[i].email_source = 'cross_domain_owner';
        results[i].verification = primary.verification;
        results[i].enriched     = true;
      }
      results[i].duplicate_owner = true;
      results[i].loadable        = false;
      results[i].hold_reason     = 'duplicate_owner';
      results[i].primary_business = primary.business_name || null;
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses array required' });
  }

  try {
    let results = await Promise.all(businesses.map(biz => enrichOne(biz)));
    results = applyOwnerGrouping(results);

    const enriched   = results.filter(r => r.enriched);
    const loadable   = results.filter(r => r.loadable && r.email);
    const catchAll   = results.filter(r => r.hold_reason === 'catch_all');
    const duplicates = results.filter(r => r.hold_reason === 'duplicate_owner');
    const unchecked  = results.filter(r => r.verification === 'unchecked');

    return res.status(200).json({
      total:          results.length,
      enriched_count: enriched.length,
      loadable_count: loadable.length,
      hit_rate:       results.length > 0 ? Math.round((enriched.length / results.length) * 100) : 0,
      loadable_rate:  results.length > 0 ? Math.round((loadable.length / results.length) * 100) : 0,
      verification: {
        verifier:        MV_KEY ? 'millionverifier' : 'none_configured',
        loadable:        loadable.length,
        catch_all_held:  catchAll.length,
        duplicate_held:  duplicates.length,
        unchecked:       unchecked.length,
      },
      results,
      stages_summary: {
        website_email_attempted:    results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('website_email'))).length,
        website_email_won:          results.filter(r => r.email_source === 'website_email').length,
        google_search_attempted:    results.filter(r => r.enrichment_stages_tried?.includes('google_search_email')).length,
        google_search_won:          results.filter(r => r.email_source === 'google_search_email').length,
        perplexity_search_attempted:results.filter(r => r.enrichment_stages_tried?.includes('perplexity_search_email')).length,
        perplexity_search_won:      results.filter(r => r.email_source === 'perplexity_search_email').length,
        anymail_person_attempted:   results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('anymail_person'))).length,
        prospeo_attempted:          results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('prospeo'))).length,
        anymail_company_attempted:  results.filter(r => r.enrichment_stages_tried?.includes('anymail_company')).length,
        fullenrich_attempted:       results.filter(r => r.enrichment_stages_tried?.some(s => s.startsWith('fullenrich:') && s !== 'fullenrich:skipped_budget')).length,
        fullenrich_personal_won:    results.filter(r => r.email_source === 'fullenrich_personal').length,
        cross_domain_recovered:     results.filter(r => r.email_source === 'cross_domain_owner').length,
        fullenrich_skipped_budget:  results.filter(r => r.enrichment_stages_tried?.includes('fullenrich:skipped_budget')).length,
      },
    });
  } catch (err) {
    console.error('Enrich handler error:', err);
    return res.status(500).json({ error: err.message || String(err) || 'Unknown error in enrich handler' });
  }
}
