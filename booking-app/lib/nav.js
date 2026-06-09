/**
 * Shared dashboard navigation definition + permission-aware filtering.
 * Each page renders its sidebar from visibleNav(perms) so nav items can be
 * hidden per-member, and pageAccess guards block direct URL access.
 */
export const NAV_ITEMS = [
  { href: '/dashboard/analytics',   label: 'Dashboard',   icon: 'dashboard', perm: 'page_dashboard' },
  { href: '/dashboard/leads',       label: 'Leads',       icon: 'leads',     perm: 'page_leads' },
  { href: '/dashboard/prospects',   label: 'Prospecting', icon: 'clients',   perm: 'page_prospecting' },
  { href: '/dashboard/bookings',    label: 'Meetings',    icon: 'meetings',  perm: 'page_meetings' },
  { href: '/dashboard/cq-recovery', label: 'CQ Recovery', icon: 'cq',        perm: 'page_cq' },
  { href: '/dashboard/nurture',     label: 'Nurture',     icon: 'nurture',   perm: 'page_nurture' },
  { href: '/dashboard/settings',    label: 'Settings',    icon: 'settings',  perm: 'page_settings' },
];

/** NAV_ITEMS sorted by a stored order of hrefs (unknown items keep default order at the end). */
export function orderedNavItems(order) {
  if (!Array.isArray(order) || order.length === 0) return NAV_ITEMS;
  const rank = href => {
    const i = order.indexOf(href);
    return i === -1 ? NAV_ITEMS.length + NAV_ITEMS.findIndex(n => n.href === href) : i;
  };
  return [...NAV_ITEMS].sort((a, b) => rank(a.href) - rank(b.href));
}

/** Nav items the user is allowed to see (perm !== false), in the configured order. */
export function visibleNav(perms, order) {
  return orderedNavItems(order).filter(i => !perms || perms[i.perm] !== false);
}

/** First page the user is allowed to open (fallback target for redirects). */
export function firstAllowedPath(perms) {
  const v = visibleNav(perms);
  return v[0]?.href || '/dashboard/login';
}

/** The page_* permission key for a given route path. */
export function permForPath(pathname) {
  return NAV_ITEMS.find(i => i.href === pathname)?.perm || null;
}
