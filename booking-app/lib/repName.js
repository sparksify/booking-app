/**
 * Client-safe rep-name canonicalizer (no server imports), kept in sync with the
 * normalizeRepName used in the bookings API and lib/role.js so a rep can be
 * matched whether a record stores their email or a display name.
 */
export function normalizeRepName(nameOrEmail) {
  if (!nameOrEmail) return nameOrEmail;
  const raw   = String(nameOrEmail).trim();
  const check = raw.includes('@') ? raw.split('@')[0] : raw;
  const lc    = check.toLowerCase();
  if (/^(steve sparks?|s\.?\s*sparks?|steve)$/i.test(raw) || lc === 'ssparks' || lc === 'steve') return 'Steve Sparks';
  if (/^(john doty|john|j\.?\s*doty)$/i.test(raw) || lc === 'jdoty' || lc === 'john') return 'John Doty';
  return raw;
}

/** Build the lowercased identity set for a rep (email + name variants). */
export function repIdentitySet(reps) {
  const set = new Set();
  const add = v => { if (v) set.add(String(v).trim().toLowerCase()); };
  for (const r of reps || []) {
    add(r.email);
    if (r.email?.includes('@')) add(r.email.split('@')[0]);
    add(r.name);
    add(normalizeRepName(r.email));
    add(normalizeRepName(r.name));
  }
  return set;
}

/** Does an assigned-rep value (email or name) belong to the identity set? */
export function repInSet(assigned, set) {
  if (!assigned) return false;
  const a = String(assigned).trim().toLowerCase();
  const aLocal = a.includes('@') ? a.split('@')[0] : a;
  const aNorm = String(normalizeRepName(assigned) || '').toLowerCase();
  return set.has(a) || set.has(aLocal) || (aNorm && set.has(aNorm));
}
