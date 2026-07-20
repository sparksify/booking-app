/**
 * /r/watch/[brand]  —  instant prefill redirect to the video (VSL) lander
 *
 * Identical mechanics to /r/[brand]: Facebook's completion button cannot
 * carry the lead's answers in the URL, so Pabbly/the FB webhook saves the
 * lead first, and when the lead taps the button we claim the freshest
 * unclaimed lead and 302 them — here, to their own unique page
 * /watch/[brand]/[token] instead of the booking page.
 *
 * Matching is by recency and is best-effort. The deterministic channel is
 * the watch_url the webhooks push to GHL (custom field) the instant the
 * lead lands — a GHL workflow can SMS/email that unique link, which needs
 * no matching at all.
 */
import { getSupabaseAdmin } from '@/lib/supabase';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getServerSideProps({ params }) {
  const slug = (params?.brand || '').toString().toLowerCase();
  const fallbackDest = `/watch/${encodeURIComponent(slug)}`;
  const supabase = getSupabaseAdmin();

  // Wait up to ~8s for the lead to arrive from Pabbly (see /r/[brand]).
  let lead = null;
  for (let attempt = 0; attempt < 11 && !lead; attempt++) {
    if (attempt > 0) await sleep(800);

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
      const { data: claimed } = await supabase
        .from('leads')
        .update({ claimed_at: new Date().toISOString() })
        .eq('id', candidate.id)
        .is('claimed_at', null)
        .select('id, token')
        .maybeSingle();
      if (claimed) lead = claimed;
    }
  }

  if (!lead?.token) {
    return { redirect: { destination: fallbackDest, permanent: false } };
  }

  return {
    redirect: {
      destination: `/watch/${encodeURIComponent(slug)}/${encodeURIComponent(lead.token)}`,
      permanent: false,
    },
  };
}

export default function VideoPrefillRedirect() {
  return null;
}
