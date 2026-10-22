const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'madam']);
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'esq', 'phd', 'md']);

function token(value) {
  return String(value || '').toLowerCase().replace(/[.,]/g, '');
}

/** Split a combined owner string into individual people. */
export function parseOwnerNames(ownerName) {
  if (!ownerName || typeof ownerName !== 'string') return [];
  return ownerName
    .split(/\s+and\s+|\s*&\s*|[;,]\s*/i)
    .map(name => name.trim())
    .filter(Boolean);
}

/**
 * First and last name only. Middle names and generational suffixes are dropped
 * so they are not sent to finders as part of the last name.
 */
export function personParts(name) {
  if (!name || typeof name !== 'string') return null;
  let parts = name.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFICS.has(token(parts[0]))) parts = parts.slice(1);
  while (parts.length > 1 && SUFFIXES.has(token(parts[parts.length - 1]))) parts = parts.slice(0, -1);
  if (parts.length < 2) return null;
  const first = parts[0].replace(/,+$/g, '');
  const last = parts[parts.length - 1].replace(/,+$/g, '');
  if (token(first).length < 2 || token(last).length < 2) return null;
  return { first, last, full: `${first} ${last}`, middle: parts.slice(1, -1) };
}

export function hasFullName(name) {
  return !!personParts(name);
}

export function brandKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function domainOf(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

export function uuidOrNull(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
    ? String(value)
    : null;
}
