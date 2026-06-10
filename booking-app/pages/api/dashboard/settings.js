import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

// Image uploads (logo, rep avatars) arrive as base64 data URLs — allow larger bodies.
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

/**
 * GET    /api/dashboard/settings  → returns current settings row
 * POST   /api/dashboard/settings  → updates settings row
 * PATCH  /api/dashboard/settings  → updates a team member's investment_ranges
 * DELETE /api/dashboard/settings  → toggles a team member's active status
 *
 * All require an active dashboard session.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('settings').select('*').eq('id', 1).single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const {
      work_start, work_end, timezone,
      meeting_duration, meeting_title,
      days_ahead, buffer_minutes,
      max_slots_per_day, hidden_slots_count,
      brand_pitches, form_tag_rules, revenue_per_close,
      show_revenue, show_franchise_metrics, workflow_mappings,
      event_description, event_location, event_color, event_reminder_mins,
      host_avatar_url,
      booking_headline, booking_subtitle, booking_description, booking_meeting_type,
      rep_avatars,
      bluebubbles_url, bluebubbles_password,
      platform_logo_url,
      favicon_url,
      nav_order,
      notify_on_lead, notify_on_booking, notify_recipients,
    } = req.body;

    const update = { updated_at: new Date().toISOString() };
    if (work_start              !== undefined) update.work_start              = work_start;
    if (work_end                !== undefined) update.work_end                = work_end;
    if (timezone                !== undefined) update.timezone                = timezone;
    if (meeting_duration        !== undefined) update.meeting_duration        = meeting_duration;
    if (meeting_title           !== undefined) update.meeting_title           = meeting_title;
    if (days_ahead              !== undefined) update.days_ahead              = days_ahead;
    if (buffer_minutes          !== undefined) update.buffer_minutes          = buffer_minutes;
    if (max_slots_per_day       !== undefined) update.max_slots_per_day       = max_slots_per_day;
    if (hidden_slots_count      !== undefined) update.hidden_slots_count      = hidden_slots_count;
    if (brand_pitches           !== undefined) update.brand_pitches           = brand_pitches;
    if (form_tag_rules          !== undefined) update.form_tag_rules          = form_tag_rules;
    if (revenue_per_close       !== undefined) update.revenue_per_close       = Number(revenue_per_close) || 0;
    if (show_revenue            !== undefined) update.show_revenue            = !!show_revenue;
    if (show_franchise_metrics  !== undefined) update.show_franchise_metrics  = !!show_franchise_metrics;
    if (workflow_mappings       !== undefined) update.workflow_mappings       = workflow_mappings;
    if (event_description       !== undefined) update.event_description       = event_description;
    if (event_location          !== undefined) update.event_location          = event_location;
    if (event_color             !== undefined) update.event_color             = event_color ? Number(event_color) : null;
    if (event_reminder_mins     !== undefined) update.event_reminder_mins     = Number(event_reminder_mins) || 15;
    if (host_avatar_url         !== undefined) update.host_avatar_url         = host_avatar_url || null;
    if (booking_headline        !== undefined) update.booking_headline        = booking_headline        || null;
    if (booking_subtitle        !== undefined) update.booking_subtitle        = booking_subtitle        || null;
    if (booking_description     !== undefined) update.booking_description     = booking_description     || null;
    if (booking_meeting_type    !== undefined) update.booking_meeting_type    = booking_meeting_type    || null;
    if (rep_avatars             !== undefined) update.rep_avatars             = rep_avatars;
    if (bluebubbles_url         !== undefined) update.bluebubbles_url         = bluebubbles_url         || null;
    if (bluebubbles_password    !== undefined) update.bluebubbles_password    = bluebubbles_password    || null;
    if (platform_logo_url       !== undefined) update.platform_logo_url       = platform_logo_url       || null;
    if (favicon_url             !== undefined) update.favicon_url             = favicon_url             || null;
    if (nav_order               !== undefined) update.nav_order               = Array.isArray(nav_order) ? nav_order : null;
    if (notify_on_lead          !== undefined) update.notify_on_lead          = !!notify_on_lead;
    if (notify_on_booking       !== undefined) update.notify_on_booking       = !!notify_on_booking;
    if (notify_recipients       !== undefined) update.notify_recipients       = Array.isArray(notify_recipients)
      ? [...new Set(notify_recipients.map(s => (s || '').trim().toLowerCase()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))]
      : [];

    const { data, error } = await supabase
      .from('settings')
      .update(update)
      .eq('id', 1)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PATCH') {
    // Update a team member's investment_ranges
    const { email, investment_ranges } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    if (!Array.isArray(investment_ranges)) return res.status(400).json({ error: 'investment_ranges must be an array' });

    const { error } = await supabase
      .from('team_members')
      .update({ investment_ranges })
      .eq('email', email);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    // Toggle a team member's active status
    const { email, active } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const { error } = await supabase
      .from('team_members')
      .update({ active: !!active })
      .eq('email', email);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
