import { searchWeb } from '@/lib/scout/search';
import { candidatesFromMention } from '@/lib/pipeline/ownerGate.mjs';

function overviewText(aiOverview) {
  if (!aiOverview?.text_blocks) return '';
  const lines = [];
  for (const block of aiOverview.text_blocks) {
    if (block.snippet) lines.push(block.snippet);
    for (const item of block.list || []) {
      if (item.title) lines.push(item.title);
      if (item.snippet) lines.push(item.snippet);
    }
  }
  return lines.join('\n');
}

async function serpBundle(query) {
  if (!process.env.SERP_API_KEY) return { text: '', urls: [], credits: 0 };
  const params = new URLSearchParams({ engine: 'google', q: query, num: '8', api_key: process.env.SERP_API_KEY });
  const response = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) return { text: '', urls: [], credits: 1 };
  const data = await response.json();
  const parts = [];
  const urls = [];
  const overview = overviewText(data.ai_overview);
  if (overview) parts.push(overview);
  if (data.answer_box?.snippet) parts.push(data.answer_box.snippet);
  if (data.knowledge_graph?.description) parts.push(data.knowledge_graph.description);
  for (const result of data.organic_results || []) {
    if (result.link) urls.push(result.link);
    if (result.title) parts.push(result.title);
    if (result.snippet) parts.push(result.snippet);
  }
  return { text: parts.join('\n'), urls, credits: 1 };
}

async function askHaiku(businessName, city, text) {
  if (!process.env.ANTHROPIC_API_KEY || !text?.trim()) return null;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      messages: [{
        role: 'user',
        content: `Extract the owner or founder of "${businessName}" in ${city || 'the US'} from the text below.

Only use a name that the text states for THIS business. Ignore other cities and similarly named businesses.
Full name required. If several owners are named, separate them with " and ".
Role must be owner, founder, or managing partner. A manager, chef, or employee is NOT_FOUND.
Phone only if the text gives a direct or owner number, not a generic front desk, unless the text says that number is the owner's.

Text:
${String(text).slice(0, 8000)}

Return ONLY JSON:
{"owner":"Full Name or NOT_FOUND","role":"owner or founder or managing partner or NOT_FOUND","phone":"or NOT_FOUND","source_url":"or NOT_FOUND"}`,
      }],
    }),
  });
  const payload = await response.json();
  const raw = payload.content?.[0]?.text?.trim().replace(/```json|```/g, '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      owner: parsed.owner && parsed.owner !== 'NOT_FOUND' ? parsed.owner : null,
      role: parsed.role && parsed.role !== 'NOT_FOUND' ? parsed.role : null,
      phone: parsed.phone && parsed.phone !== 'NOT_FOUND' ? parsed.phone : null,
      url: parsed.source_url && parsed.source_url !== 'NOT_FOUND' ? parsed.source_url : null,
    };
  } catch {
    return null;
  }
}

function mentioned(parsed, category, fallbackUrl) {
  if (!parsed?.owner) return [];
  return candidatesFromMention(parsed.owner, {
    category, role: parsed.role, phone: parsed.phone, url: parsed.url || fallbackUrl || null,
  });
}

export async function mapsPlaceOwner(biz) {
  const calls = [];
  let business_phone = biz.phone || null;
  let text = biz.description || '';
  let url = null;
  if (process.env.SERP_API_KEY && (biz.place_id || (!text && biz.business_name))) {
    const params = new URLSearchParams({
      engine: 'google_maps',
      api_key: process.env.SERP_API_KEY,
      ...(biz.place_id
        ? { type: 'place', place_id: biz.place_id }
        : { type: 'search', q: `${biz.business_name} ${biz.city || ''}`.trim() }),
    });
    const response = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(20000) });
    calls.push({ finder: 'serpapi_maps_place', stage: 'name', credits: 1 });
    if (response.ok) {
      const data = await response.json();
      const place = data.place_results || data.local_results?.[0] || {};
      business_phone = place.phone || business_phone;
      url = place.website || place.link || (biz.place_id ? `https://maps.google.com/?q=place_id:${biz.place_id}` : null);
      const reviews = (place.user_reviews || data.user_reviews || []).slice(0, 4).map(review => review.snippet || review.description || '').join('\n');
      text = [place.description, place.title, reviews].filter(Boolean).join('\n');
    }
  }
  const parsed = await askHaiku(biz.business_name, biz.city, text);
  if (parsed) calls.push({ finder: 'claude_haiku_maps', stage: 'name', credits: 1 });
  return { business_phone, calls, candidates: mentioned(parsed, 'maps', url) };
}

export async function pressOwner(biz) {
  if (!process.env.SERP_API_KEY) return { calls: [] };
  const queries = [
    `"${biz.business_name}" ${biz.city || ''} owner`,
    `"${biz.business_name}" ${biz.city || ''} founder`,
    `"${biz.business_name}" ${biz.city || ''} "managing partner"`,
  ];
  const calls = [];
  for (const query of queries) {
    const bundle = await serpBundle(query);
    if (bundle.credits) calls.push({ finder: 'serpapi_press', stage: 'name', credits: bundle.credits });
    const parsed = await askHaiku(biz.business_name, biz.city, bundle.text);
    if (parsed) calls.push({ finder: 'claude_haiku_press', stage: 'name', credits: 1 });
    const candidates = mentioned(parsed, 'press', bundle.urls[0]);
    if (candidates.length) return { calls, candidates };
  }
  return { calls, candidates: [] };
}

export async function filingsOwner(biz) {
  if (!process.env.SERP_API_KEY) return { calls: [] };
  const city = biz.city || '';
  const queries = [
    `"${biz.business_name}" ${city} (LLC OR "registered agent" OR "secretary of state" OR filing) (owner OR founder OR member)`,
    `"${biz.business_name}" ${city} site:linkedin.com/in (owner OR founder OR "managing partner")`,
  ];
  const calls = [];
  for (const query of queries) {
    let results = [];
    try {
      results = await searchWeb(query, { limit: 6 });
      calls.push({ finder: 'scout_search_filings', stage: 'name', credits: 1 });
    } catch (error) {
      calls.push({ finder: 'scout_search_filings', stage: 'name', credits: 0, error: error.message });
      return { calls, candidates: [] };
    }
    const text = results.map(result => `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`).join('\n');
    const parsed = await askHaiku(biz.business_name, biz.city, text);
    if (parsed) calls.push({ finder: 'claude_haiku_filings', stage: 'name', credits: 1 });
    const candidates = mentioned(parsed, 'filings_linkedin', results[0]?.url || null);
    if (candidates.length) return { calls, candidates };
  }
  return { calls, candidates: [] };
}

export async function perplexityOwner(biz) {
  if (!process.env.OPENROUTER_API_KEY) return { calls: [] };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: 'perplexity/sonar',
      max_tokens: 180,
      messages: [{
        role: 'user',
        content: `Who owns or founded "${biz.business_name}" in ${biz.city || 'the US'}? Search the web. Do not guess. Do not return an email address.
Return ONLY JSON: {"owner":"First Last or NOT_FOUND","role":"owner or founder or managing partner or NOT_FOUND","phone":"direct phone or NOT_FOUND","source_url":"or NOT_FOUND"}`,
      }],
    }),
  });
  const payload = await response.json();
  const cost = typeof payload.usage?.cost === 'number' ? payload.usage.cost : null;
  const calls = [{ finder: 'perplexity_name', stage: 'name', credits: 1, cost_usd: cost }];
  const text = payload.choices?.[0]?.message?.content?.trim() || '';
  let parsed = null;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const json = JSON.parse(clean);
    parsed = {
      owner: json.owner && json.owner !== 'NOT_FOUND' ? json.owner : null,
      role: json.role && json.role !== 'NOT_FOUND' ? json.role : null,
      phone: json.phone && json.phone !== 'NOT_FOUND' ? json.phone : null,
      url: json.source_url && json.source_url !== 'NOT_FOUND' ? json.source_url : null,
    };
  } catch { parsed = null; }
  return { calls, candidates: mentioned(parsed, 'perplexity', parsed?.url) };
}
