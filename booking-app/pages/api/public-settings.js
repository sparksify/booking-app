import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/public-settings
 * No auth required — returns only the fields safe to expose publicly
 * (host avatar, meeting title, etc.) for use on the booking landing page.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('settings')
    .select('host_avatar_url, meeting_title')
    .eq('id', 1)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.json({
    host_avatar_url: data?.host_avatar_url || null,
    meeting_title:   data?.meeting_title   || null,
  });
}
