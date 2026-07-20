/**
 * /watch/[brand]/[token]  —  a lead's own unique video lander URL
 *
 * The token is the per-lead secret from the leads table (same one the booking
 * flow uses as lead_id). The page resolves the lead SERVER-SIDE from the
 * database, so the prefill can never belong to anyone else — no query-string
 * matching, no recency race. Safe to re-open, and ready to be texted/emailed
 * to the lead later (GHL workflow, nurture SMS, etc.).
 *
 * Renders the exact same lander as /watch/[brand]; only the data source
 * differs (DB row here vs. query params there).
 */
import { getSupabaseAdmin } from '@/lib/supabase';
import WatchPage from '../[brand]';

export async function getServerSideProps({ params }) {
  const slug = (params?.brand || '').toString().toLowerCase();
  const token = (params?.token || '').toString();
  const supabase = getSupabaseAdmin();

  const [{ data: brand }, { data: lead }] = await Promise.all([
    supabase
      .from('brands')
      .select('slug, name, wistia_media_id, watch_headline, watch_subtitle')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('token, first_name, last_name, email, phone, investment_level, raw_fields')
      .eq('token', token)
      .maybeSingle(),
  ]);

  if (!brand || !brand.wistia_media_id) return { notFound: true };

  // Unknown token → plain (un-prefilled) lander rather than a dead end.
  if (!lead) {
    return { redirect: { destination: `/watch/${encodeURIComponent(slug)}`, permanent: false } };
  }

  const rf = lead.raw_fields || {};
  const capital = rf.liquid_capital || rf.cash_available || rf['cash_available?_']
               || rf['cash_available?'] || lead.investment_level || '';

  return {
    props: {
      brand: {
        slug: brand.slug,
        name: brand.name,
        mediaId: brand.wistia_media_id,
        headline: brand.watch_headline || `A quick message for you, from ${brand.name}`,
        subtitle: brand.watch_subtitle || 'Watch this short video before your call.',
      },
      prefill: {
        firstName:     lead.first_name || '',
        lastName:      lead.last_name || '',
        email:         lead.email || '',
        phone:         lead.phone || '',
        liquidCapital: String(capital || '').replace(/_/g, ' ').trim(),
        leadId:        lead.token,
      },
    },
  };
}

export default WatchPage;
