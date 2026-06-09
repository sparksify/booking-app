import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]';
import { getPermissions } from '@/lib/role';
import { firstAllowedPath, permForPath } from '@/lib/nav';

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
  return { session, perms };
}
