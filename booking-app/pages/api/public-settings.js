import { getSupabaseAdmin } from '@/lib/supabase';

const TZ_LABEL = {
  'America/New_York':    'Eastern Time',
  'America/Chicago':     'Central Time',
  'America/Denver':      'Mountain Time',
  'America/Los_Angeles': 'Pacific Time',
};

/**
 * GET /api/public-settings
 * No auth required — returns only fields safe to expose publicly
 * for use on the booking landing page.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('settings')
    .select('host_avatar_url, meeting_title, meeting_duration, timezone, booking_headline, booking_subtitle, booking_description, booking_meeting_type')
    .eq('id', 1)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.json({
    host_avatar_url:      data?.host_avatar_url     || null,
    meeting_title:        data?.meeting_title        || null,
    meeting_duration:     data?.meeting_duration     || null,
    timezone_label:       TZ_LABEL[data?.timezone]  || data?.timezone || null,
    booking_headline:     data?.booking_headline     || null,
    booking_subtitle:     data?.booking_subtitle     || null,
    booking_description:  data?.booking_description  || null,
    booking_meeting_type: data?.booking_meeting_type || null,
  });
}
