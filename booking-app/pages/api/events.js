import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/events
 *
 * Logs a booking-funnel event. No auth required — called from the public
 * booking page. Rate-limit protection: we only write to the events table
 * and do no heavy computation here.
 *
 * Body: {
 *   event_type  : string   (required)
 *   session_id  : string   (required — random UUID set on page load)
 *   lead_id     : string?  (UUID if lead token was resolved)
 *   booking_id  : string?  (UUID once booking is created)
 *   props       : object?  (arbitrary event payload)
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    event_type,
    session_id,
    lead_id,
    booking_id,
    props = {},
  } = req.body || {};

  if (!event_type || !session_id) {
    return res.status(400).json({ error: 'event_type and session_id required' });
  }

  const VALID_TYPES = new Set([
    'page_view',
    'recommended_shown',
    'recommended_accepted',
    'recommended_rejected',
    'calendar_opened',
    'slot_selected',
    'booking_completed',
    'calendar_add_clicked',
    'booking_abandoned',
  ]);

  if (!VALID_TYPES.has(event_type)) {
    return res.status(400).json({ error: `Unknown event_type: ${event_type}` });
  }

  const supabase = getSupabaseAdmin();

  // Pull FB attribution from lead if lead_id is provided
  let fb = {};
  if (lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('fb_campaign_id, fb_adset_id, fb_ad_id, fb_form_id')
      .eq('id', lead_id)
      .single();
    if (lead) fb = lead;
  }

  const { error } = await supabase.from('events').insert({
    event_type,
    session_id,
    lead_id:       lead_id   || null,
    booking_id:    booking_id || null,
    props,
    fb_campaign_id: fb.fb_campaign_id || null,
    fb_adset_id:    fb.fb_adset_id    || null,
    fb_ad_id:       fb.fb_ad_id       || null,
    fb_form_id:     fb.fb_form_id     || null,
  });

  if (error) {
    console.error('[events] insert error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
