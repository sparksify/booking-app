import { lookupAreaCode } from './normalizeLocation';

export function phoneAreaCode(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(national) ? national.slice(0, 3) : null;
}

// Shared by the Territory row and express check so they cannot disagree.
export function resolveClientTerritory({ lead, booking, contact } = {}) {
  if (booking?.email && lead?.email && booking.email.toLowerCase() !== lead.email.toLowerCase()) lead = null;
  if (booking?.email && contact?.email && booking.email.toLowerCase() !== contact.email.toLowerCase()) contact = null;
  let raw = lead?.raw_fields || {};
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = {}; } }
  const cf = contact?.custom_fields || {};
  const areaCode = lead?.location_area_code || contact?.area_code || phoneAreaCode(booking?.phone || lead?.phone || contact?.phone);
  const sub = lead?.location_zip || contact?.zip || (areaCode ? `Area code ${areaCode}` : null);
  // Keep city/state pairs together rather than combining unrelated sources.
  const city = lead?.location_city || contact?.city;
  const state = lead?.location_city ? lead.location_state : contact?.city ? contact.state : lead?.location_state || contact?.state;
  if (city) {
    const primary = [city, state].filter(Boolean).join(', ');
    return { primary, sub, origin: primary, source: lead?.location_city
      ? (lead.location_area_code ? 'area_code' : 'territory') : contact?.location_source || 'territory' };
  }
  const field = Object.entries(raw || {}).find(([key]) => /territory|areaofinterest|interestedarea/.test(key.toLowerCase().replace(/[^a-z0-9]/g, '')))?.[1];
  const fallback = lead?.location_raw || field || cf['Areas of Interest'] || cf['Territory Interest'];
  // Accept a city/state form answer or a standalone known area code as well.
  if (typeof fallback === 'string' && /^[^,\d]+,\s*[a-zA-Z .]+$/.test(fallback.trim())) {
    return { primary: fallback.trim(), sub, origin: fallback.trim(), source: 'territory' };
  }
  const rawArea = typeof fallback === 'string' && /^\(?\d{3}\)?$/.test(fallback.trim())
    ? fallback.replace(/\D/g, '') : null;
  const rawRegion = lookupAreaCode(rawArea);
  if (rawRegion) {
    const primary = `${rawRegion.city}, ${rawRegion.state}`;
    return { primary, sub: `Area code ${rawArea}`, origin: primary, source: 'area_code' };
  }
  // A state or arbitrary form answer is not a sufficiently precise origin.
  const area = lookupAreaCode(areaCode);
  if (area && !fallback && !state) {
    const primary = `${area.city}, ${area.state}`;
    return { primary, sub: `Area code ${areaCode}`, origin: primary, source: 'area_code' };
  }
  if (fallback || state) return { primary: String(fallback || state), sub, origin: null, source: 'unresolved' };
  return null;
}
