import { parseOwnerNames, personParts } from './ownerNames.mjs';

const ROLE_LOCAL = /^(info|contact|hello|admin|sales|support|office|booking|bookings|reservations|reserve|hi|team|mail|enquiries|inquiries|help|jobs|careers|press|media|marketing|accounts|billing|orders|catering|concierge|frontdesk|reception|noreply|no-reply|donotreply)$/i;
const FREEMAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|aol|icloud|me|msn|protonmail|proton|gmx|pm)\./i;

export function cleanPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

export function isConfirmedOwner(biz) {
  return biz?.owner_confidence === 'medium' || biz?.owner_confidence === 'high';
}

export function ownerPerson(biz) {
  if (biz?.owner_first && biz?.owner_last) return personParts(`${biz.owner_first} ${biz.owner_last}`);
  return parseOwnerNames(biz?.owner_name || '').map(personParts).find(Boolean) || null;
}

export function emailMatchesOwner(email, person) {
  if (!email || !person) return false;
  const local = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const first = person.first.toLowerCase().replace(/[^a-z]/g, '');
  const last = person.last.toLowerCase().replace(/[^a-z]/g, '');
  if (!first || !last || local.length < 2) return false;
  if (local.includes(first) && local.includes(last)) return true;
  if (local === `${first[0]}${last}`) return true;
  if (first.length >= 3 && local === first) return true;
  return false;
}

/** role, freemail, or possible. Catch-all is a verification result, not a shape. */
export function inboxKind(email) {
  const lower = String(email || '').toLowerCase().trim();
  const local = lower.split('@')[0] || '';
  if (ROLE_LOCAL.test(local)) return 'role';
  if (FREEMAIL.test(lower)) return 'freemail';
  return 'possible';
}

function staffRole(role) {
  if (!role) return false;
  return /chef|manager|employee|staff|server|bartender|director of operations/i.test(role)
    && !/owner|founder|partner|member|proprietor|principal/i.test(role);
}

export function candidatesFromMention(owner, meta = {}) {
  if (!owner || staffRole(meta.role)) return [];
  return parseOwnerNames(owner).map(personParts).filter(Boolean).map(person => ({
    name: person.full,
    category: meta.category,
    url: meta.url || null,
    role: meta.role || null,
    phone: cleanPhone(meta.phone),
    source: meta.category,
  }));
}

export function judgeCandidates(candidates) {
  const groups = new Map();
  for (const candidate of candidates || []) {
    const person = personParts(candidate.name);
    if (!person || !candidate.category || candidate.category === 'supplied') continue;
    const key = `${person.first.toLowerCase()}|${person.last.toLowerCase()}`;
    const group = groups.get(key) || {
      ...person, categories: new Set(), urls: [], roles: [], phones: [],
    };
    group.categories.add(candidate.category);
    if (candidate.url) group.urls.push(candidate.url);
    if (candidate.role) group.roles.push(candidate.role);
    if (candidate.phone) group.phones.push({ phone: candidate.phone, source: candidate.source || candidate.category });
    groups.set(key, group);
  }
  const ranked = [...groups.values()].sort((a, b) => b.categories.size - a.categories.size || b.urls.length - a.urls.length);
  const best = ranked[0];
  if (!best) {
    return {
      owner_confidence: 'low', owner_name: null, owner_first: null, owner_last: null, owner_role: null,
      owner_source_urls: [], owner_sources: [], owner_phone: null, owner_phone_source: null,
    };
  }
  const count = best.categories.size;
  const role = best.roles.find(item => /founder/i.test(item)) || best.roles.find(item => /owner/i.test(item)) || best.roles[0] || null;
  const phone = best.phones[0] || null;
  return {
    owner_confidence: count >= 3 ? 'high' : count >= 2 ? 'medium' : 'low',
    owner_name: best.full,
    owner_first: best.first,
    owner_last: best.last,
    owner_role: role,
    owner_source_urls: [...new Set(best.urls)],
    owner_sources: [...best.categories],
    owner_phone: phone?.phone || null,
    owner_phone_source: phone?.source || null,
  };
}

export const NAME_SOURCE_CATALOG = [
  { order: 1, id: 'site', name: 'Business website (about, team, contact) read by Claude Haiku', cost: 'Fetching the page is free. Haiku is about $0.001 per page, usually 1–3 pages, and the crawl stops once the page names an owner.' },
  { order: 2, id: 'maps', name: 'Google Maps listing and place details via SerpAPI', cost: 'About $0.01 when a place-details search is required. A phone already returned by the Maps scout costs nothing more. Haiku runs only when the listing has text worth reading.' },
  { order: 3, id: 'press', name: 'SerpAPI Google results for press and owner mentions, including the AI Overview', cost: 'About $0.01 per search, up to three queries, plus one Haiku read. Later queries are skipped once two sources agree.' },
  { order: 4, id: 'filings_linkedin', name: 'State business filings and LinkedIn via Scout search.js (SerpAPI Google)', cost: 'About $0.01 per search, two distinct queries, plus one Haiku read. This is the Scout search client. Scout extract.js is not called here: that prompt returns company names for market scouting, not the owner of a known business.' },
  { order: 5, id: 'perplexity', name: 'Perplexity sonar through OpenRouter, asked for the owner name', cost: 'About $0.005–$0.02 per call. It runs only when the name is still unconfirmed. It is not an email finder.' },
];

export const NAME_SOURCES_NOT_USED = [
  { id: 'anymail_company', reason: 'Anymail’s company lookup returns an email for the literal name “owner”. It does not return a person’s name, and calling it would spend finder credits on the generic inboxes this pipeline is avoiding.' },
  { id: 'scout_extract', reason: 'lib/scout/extract.js extracts business names from Scout missions. It is not an owner lookup for a business whose URL is already known.' },
  { id: 'serpapi_email', reason: 'SerpAPI and Perplexity are not used to search for email addresses after the name stage. Search stops once the name sources have run.' },
];
