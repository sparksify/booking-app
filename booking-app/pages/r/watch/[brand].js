/**
 * /r/watch/[brand]  —  prefill redirect to the video (VSL) lander
 *
 * The Facebook Lead Ad completion button points here. Destination is the
 * lead's own unique page: /watch/[brand]/[token].
 *
 * Matching, in order of preference:
 *   1. DETERMINISTIC — point the FB button at /r/watch/{brand}?email={{email}}
 *      (FB resolves the merge token to the submitter's email). We look the
 *      lead up by that exact email, so two leads in flight can never swap
 *      info no matter how long either sits on the thank-you screen or the
 *      20-minute video.
 *   2. FALLBACK — no email in the URL: the /r/[brand]-style recency match
 *      (freshest unclaimed lead in the last 5 min, atomically claimed).
 *
 * Either way we still mark claimed_at so the recency fallback can never
 * hand this lead's info to a different visitor.
 */
import { getSupabaseAdmin } from '@/lib/supabase';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD_COLS = 'id, token, email, claimed_at';

export async function getServerSideProps({ params, query }) {
  const slug = (params?.brand || '').toString().toLowerCase();
  const fallbackDest = `/watch/${encodeURIComponent(slug)}`;
  const supabase = getSupabaseAdmin();

  // FB merge token arrives verbatim if unresolved — treat that as absent.
  const emailParam = (query?.email || '').toString().trim().toLowerCase();
  const email = emailParam && !emailParam.includes('{{') ? emailParam : '';

  // Wait up to ~8s for the webhook to land the lead (click can beat Pabbly).
  let lead = null;
  for (let attempt = 0; attempt < 11 && !lead; attempt++) {
    if (attempt > 0) await sleep(800);

    if (email) {
      // Deterministic: this exact person's most recent lead (24h window
      // covers re-clicks from the FB confirmation long after submitting).
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('leads')
        .select(LEAD_COLS)
        .ilike('email', email)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lead = data || null;
    } else {
      // Recency fallback — same claim-race guard as /r/[brand].
      const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: candidate } = await supabase
        .from('leads')
        .select(LEAD_COLS)
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
          .select(LEAD_COLS)
          .maybeSingle();
        if (claimed) lead = claimed;
      }
    }
  }

  if (!lead?.token) {
    return { redirect: { destination: fallbackDest, permanent: false } };
  }

  // Email-matched leads weren't claimed above — claim now so the recency
  // fallback can't hand this lead to someone else.
  if (!lead.claimed_at) {
    await supabase
      .from('leads')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', lead.id)
      .is('claimed_at', null);
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
