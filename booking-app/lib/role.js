import { getSupabaseAdmin } from '@/lib/supabase';
import { resolvePermissions } from '@/lib/permissions';

/**
 * Canonicalize a rep name-or-email to a display name. Kept in sync with the
 * normalizeRepName used in the bookings API so member scoping can match a
 * person whether a record stores their email or their normalized name.
 */
export function normalizeRepName(nameOrEmail) {
  if (!nameOrEmail) return nameOrEmail;
  const raw   = String(nameOrEmail).trim();
  const check = raw.includes('@') ? raw.split('@')[0] : raw;
  const lc    = check.toLowerCase();
  if (/^(steve sparks?|s\.?\s*sparks?|steve)$/i.test(raw) || lc === 'ssparks' || lc === 'steve') return 'Steve Sparks';
  if (/^(john doty|john|j\.?\s*doty)$/i.test(raw) || lc === 'john' || lc === 'jdoty') return 'John Doty';
  return raw;
}

/**
 * Resolve a user's role ('admin' | 'member') from their email.
 * Admins are determined by team_members.role, with an env fallback
 * (ADMIN_EMAILS, comma-separated) so the primary admin can never be locked out.
 */
export async function getRole(email) {
  if (!email) return 'member';
  const adminEnv = (process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (adminEnv.includes(email.toLowerCase())) return 'admin';

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('team_members')
    .select('role, name')
    .ilike('email', email)
    .maybeSingle();
  return data?.role === 'admin' ? 'admin' : 'member';
}

/**
 * Resolve a user's effective permission object (admin → all true; member →
 * defaults merged with their stored overrides).
 */
export async function getPermissions(email) {
  const role = await getRole(email);
  if (role === 'admin') return resolvePermissions('admin', {});

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('team_members')
    .select('permissions')
    .ilike('email', email)
    .maybeSingle();
  return resolvePermissions('member', data?.permissions || {});
}

/**
 * Build the set of identity strings (lowercased) that mean "this user", so a
 * record's assigned rep — stored as an email OR a normalized name — can be
 * matched. Returns a Set plus a matcher function.
 */
export async function getRepIdentity(email) {
  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase
    .from('team_members')
    .select('email, name')
    .ilike('email', email)
    .maybeSingle();

  const set = new Set();
  const add = v => { if (v) set.add(String(v).trim().toLowerCase()); };
  add(email);
  if (email?.includes('@')) add(email.split('@')[0]);
  add(member?.name);
  add(normalizeRepName(email));
  if (member?.name) add(normalizeRepName(member.name));

  return set;
}

/**
 * Does an assigned-rep value (email or name) belong to the given identity set?
 */
export function repMatches(assigned, identitySet) {
  if (!assigned) return false;
  const a      = String(assigned).trim().toLowerCase();
  const aLocal = a.includes('@') ? a.split('@')[0] : a;
  const aNorm  = String(normalizeRepName(assigned) || '').toLowerCase();
  return identitySet.has(a) || identitySet.has(aLocal) || (aNorm && identitySet.has(aNorm));
}
