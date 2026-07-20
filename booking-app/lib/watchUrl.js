/**
 * buildWatchUrl — the lead's own unique video-lander URL.
 * /watch/[brand]/[token] resolves the lead server-side by token, so this
 * link is safe to deliver over any channel (GHL SMS/email workflows).
 */
export function buildWatchUrl(brandSlug, token) {
  const base = (process.env.NEXTAUTH_URL || 'https://www.bookkanso.co').replace(/\/$/, '');
  return `${base}/watch/${encodeURIComponent(brandSlug)}/${encodeURIComponent(token)}`;
}
