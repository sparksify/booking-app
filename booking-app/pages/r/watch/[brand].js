/**
 * /r/watch/[brand]  —  instant prefill redirect to the video (VSL) lander
 *
 * Identical mechanics to /r/[brand], but the destination is /watch/[brand]
 * instead of the booking page. The Facebook Lead Ad completion button points
 * here; Pabbly (or the native FB webhook) has already saved the lead, so we
 * claim the freshest unclaimed lead and 302 to the video lander with the
 * lead's info in the query string — which the lander uses to identify the
 * viewer to Wistia and to our own event tracking.
 */
import { getSupabaseAdmin } from '@/lib/supabase';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getServerSideProps({ params }) {
  const slug = (params?.brand || '').toString().toLowerCase();
  const dest = `/watch/${encodeURIComponent(slug)}`;
  const supabase = getSupabaseAdmin();

  // Wait up to ~8s for the lead to arrive from Pabbly (see /r/[brand]).
  let lead = null;
  for (let attempt = 0; attempt < 11 && !lead; attempt++) {
    if (attempt > 0) await sleep(800);

    const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: candidate } = await supabase
      .from('leads')
      .select('id, token, first_name, last_name, email, phone, investment_level, raw_fields')
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
        .select('id, token, first_name, last_name, email, phone, investment_level, raw_fields')
        .maybeSingle();
      if (claimed) lead = claimed;
    }
  }

  if (!lead) {
    return { redirect: { destination: dest, permanent: false } };
  }

  const rf = lead.raw_fields || {};
  const capital = rf.liquid_capital || rf.cash_available || rf['cash_available?_']
               || rf['cash_available?'] || lead.investment_level || '';

  const qp = new URLSearchParams();
  if (lead.first_name) qp.set('first_name', lead.first_name);
  if (lead.last_name)  qp.set('last_name',  lead.last_name);
  if (lead.phone)      qp.set('phone',      lead.phone);
  if (lead.email)      qp.set('email',      lead.email);
  if (capital)         qp.set('liquid_capital', String(capital).replace(/_/g, ' ').trim());
  if (lead.token)      qp.set('lead_id', lead.token);

  const qs = qp.toString();
  return { redirect: { destination: qs ? `${dest}?${qs}` : dest, permanent: false } };
}

export default function VideoPrefillRedirect() {
  return null;
}
