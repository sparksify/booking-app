import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/favicon
 *
 * Serves the favicon uploaded in Settings (stored as a data URL in
 * settings.favicon_url). Referenced statically from _document via
 * <link rel="icon" href="/api/favicon">, so the link never changes but the
 * bytes update whenever a new favicon is uploaded. Returns 204 when none is
 * set, letting the browser fall back to the default.
 */
let _cache = { at: 0, url: null };

export default async function handler(req, res) {
  try {
    // Tiny in-memory cache so we don't hit the DB on every tab load.
    if (Date.now() - _cache.at > 60_000) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.from('settings').select('favicon_url').eq('id', 1).maybeSingle();
      _cache = { at: Date.now(), url: data?.favicon_url || null };
    }

    const url = _cache.url;
    const m = typeof url === 'string' && url.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      res.statusCode = 204;
      return res.end();
    }

    const buf = Buffer.from(m[2], 'base64');
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.end(buf);
  } catch {
    res.statusCode = 204;
    return res.end();
  }
}
