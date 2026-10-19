import { NextResponse } from 'next/server';

/**
 * CSRF guard for the cookie-authenticated API routes.
 *
 * The NextAuth session cookie is SameSite=None (so the dashboard works inside
 * the GoHighLevel iframe — see pages/api/auth/[...nextauth].js), which means
 * browsers attach it to cross-site requests. Mutating requests must therefore
 * prove they come from our own pages: browsers always send an Origin header on
 * cross-origin form posts and on fetch POSTs, so a mismatched Origin is
 * rejected here. Requests without an Origin header (curl, webhooks, native
 * apps) pass through to each route's own session check.
 */
export const config = {
  matcher: ['/api/dashboard/:path*', '/api/mobile/:path*', '/api/analytics', '/api/lead-events'],
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function middleware(req) {
  if (SAFE_METHODS.has(req.method)) return NextResponse.next();

  const origin = req.headers.get('origin');
  if (!origin) return NextResponse.next();

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  // Compare against the requested host (x-forwarded-host on Vercel) — the
  // iframe's own fetches are same-origin (app.trykanso.co → app.trykanso.co).
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (originHost && originHost === host) return NextResponse.next();

  return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 });
}
