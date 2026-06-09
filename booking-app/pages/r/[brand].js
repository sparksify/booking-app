/**
 * /r/[brand]  —  instant prefill redirect
 *
 * The Facebook Lead Ad's completion button points here (e.g. /r/storytimechess).
 * Facebook can't carry the lead's answers in the URL, so instead Pabbly POSTs
 * the lead to /api/webhooks/pabbly the instant they submit. When the lead then
 * taps the button, we grab the lead Pabbly just captured and 302-redirect them
 * to the brand booking page with their info pre-filled in the query string.
 *
 * Matching is by recency: the most-recently-created lead that hasn't been
 * claimed yet (within the last few minutes). At low lead volume this reliably
 * maps "the person who just clicked" to "the lead Pabbly just saved". We claim
 * the lead so a second visitor can't pick up someone else's info, and we retry
 * briefly in case the click beats the webhook.
 */
import { getSupabaseAdmin } from '@/lib/supabase';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getServerSideProps({ params }) {
  const slug = (params?.brand || '').toString().toLowerCase();
  const dest = `/${slug}`;
  const supabase = getSupabaseAdmin();

  let lead = null;
  for (let attempt = 0; attempt < 4 && !lead; attempt++) {
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
      // Claim it — conditional on still being unclaimed (guards the rare race).
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

  // No lead captured yet — send them to the plain booking page rather than stall.
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

export default function PrefillRedirect() {
  return null;
}
