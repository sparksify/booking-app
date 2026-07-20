import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * /api/watch-match?brand=slug
 *
 * One matching attempt for the /r/watch interstitial. The lead just tapped
 * the FB completion button; Pabbly/the FB webhook is pushing their data in
 * parallel. The interstitial polls this endpoint until the lead lands:
 *
 *   { url: '/watch/{brand}/{token}' }  — lead found & atomically claimed
 *   { pending: true }                  — nothing yet, poll again
 *
 * Same recency-claim mechanics as /r/[brand], split into single attempts so
 * the client controls the wait (branded loading screen, ~25s budget) instead
 * of a blank blocking server response.
 */
export default async function handler(req, res) {
  const slug = (req.query.brand || '').toString().toLowerCase();
  if (!slug) return res.status(400).json({ error: 'brand required' });

  const supabase = getSupabaseAdmin();
  const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: candidate } = await supabase
    .from('leads')
    .select('id, token')
    .is('claimed_at', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (candidate) {
    // Conditional claim guards the race where two visitors poll at once.
    const { data: claimed } = await supabase
      .from('leads')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', candidate.id)
      .is('claimed_at', null)
      .select('token')
      .maybeSingle();

    if (claimed?.token) {
      return res.json({
        url: `/watch/${encodeURIComponent(slug)}/${encodeURIComponent(claimed.token)}`,
      });
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.json({ pending: true });
}
