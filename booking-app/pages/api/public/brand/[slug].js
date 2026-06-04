/**
 * GET /api/public/brand/[slug]
 *
 * Public (no auth) endpoint that returns the booking-page-safe config for a brand.
 * Used by /pages/[brand].js to load brand content on the server side.
 *
 * Returns only fields safe for public consumption — no routing rules, no counters,
 * no GHL tags, no rep email list.
 */

import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  const supabase = getSupabaseAdmin();

  // Also load global settings for work hours, timezone, buffer, days_ahead
  const [brandRes, settingsRes] = await Promise.all([
    supabase
      .from('brands')
      .select('slug, name, booking_headline, booking_subtitle, booking_description, meeting_title, meeting_duration, event_description, event_location, event_color, event_reminder_mins')
      .eq('slug', slug.toLowerCase())
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('settings')
      .select('work_start, work_end, timezone, days_ahead, buffer_minutes, max_slots_per_day, hidden_slots_count, host_avatar_url')
      .eq('id', 1)
      .single(),
  ]);

  if (!brandRes.data) {
    return res.status(404).json({ error: `Brand '${slug}' not found` });
  }

  return res.json({
    brand:    brandRes.data,
    settings: settingsRes.data || {},
  });
}
