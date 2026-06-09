import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]';
import { getPermissions } from '@/lib/role';
import { firstAllowedPath, permForPath } from '@/lib/nav';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Shared dashboard page guard for getServerSideProps.
 *
 * Usage:
 *   const gate = await guardDashboardPage(context, '/dashboard/leads');
 *   if (gate.redirect) return gate;
 *   const { session, perms } = gate;
 *
 * - Redirects to login when unauthenticated.
 * - Redirects to the user's first allowed page when they lack access to `pathname`.
 * - Otherwise returns { session, perms }.
 */
export async function guardDashboardPage(context, pathname) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) {
    return { redirect: { destination: '/dashboard/login', permanent: false } };
  }
  const perms = await getPermissions(session.user?.email);
  const perm = pathname ? permForPath(pathname) : null;
  if (perm && perms[perm] === false) {
    const dest = firstAllowedPath(perms);
    return { redirect: { destination: dest, permanent: false } };
  }

  // Chrome settings shown in every sidebar (logo + nav order)
  let logo = null;
  let navOrder = null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('settings').select('platform_logo_url, nav_order').eq('id', 1).single();
    logo = data?.platform_logo_url || null;
    navOrder = Array.isArray(data?.nav_order) ? data.nav_order : null;
  } catch { /* non-fatal */ }

  return { session, perms, logo, navOrder };
}
