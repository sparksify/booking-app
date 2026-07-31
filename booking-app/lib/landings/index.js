import cmdt from './cmdt';

// Per-brand marketing landing (copy + CSS) for the /watch funnel page.
// Add a new entry keyed by brand slug to give that brand a custom landing.
const LANDINGS = { cmdt };

export function getLanding(slug) {
  return LANDINGS[(slug || '').toLowerCase()] || null;
}
