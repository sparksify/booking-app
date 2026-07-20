import { getSupabaseAdmin } from '@/lib/supabase';
import { logLeadEvent } from '@/lib/leadEvents';

/**
 * /api/track/video-event
 *
 * POST — logs a single client-side video engagement event from /watch/[brand].
 * No auth (public lander), so event types are allowlisted and payloads trimmed.
 *
 * Body: { media_id, session_id, event_type, email?, lead_id?, brand_slug?, event_data? }
 *
 * Every event lands in video_events (real-time first-party analytics). The
 * milestone events also mirror into lead_events so they show up on the lead's
 * dashboard timeline. Wistia's own per-viewer heatmaps stay in Wistia, keyed
 * by the same email we pass to the player.
 */

const EVENT_ALLOWLIST = new Set([
  'video_page_viewed',
  'play',
  'pause',
  'seek',
  'percent_watched',   // event_data: { percent: 25|50|75|95 }
  'end',
  'cta_clicked',
]);

// Milestones worth mirroring to the lead's cross-channel timeline
const TIMELINE_EVENTS = new Set(['video_page_viewed', 'play', 'percent_watched', 'end', 'cta_clicked']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { media_id, session_id, event_type, email, lead_id, brand_slug, event_data = {} } = req.body || {};

  if (!media_id || !session_id || !event_type) {
    return res.status(400).json({ error: 'media_id, session_id and event_type required' });
  }
  if (!EVENT_ALLOWLIST.has(event_type)) {
    return res.status(400).json({ error: `Event type not allowed: ${event_type}` });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('video_events').insert({
    email:      email || null,
    lead_id:    lead_id || null,
    brand_slug: brand_slug || null,
    media_id:   String(media_id).slice(0, 64),
    session_id: String(session_id).slice(0, 64),
    event_type,
    event_data,
  });
  if (error) console.warn('[video-event] insert error:', error.message);

  if (email && TIMELINE_EVENTS.has(event_type)) {
    await logLeadEvent(email, `video_${event_type}`.replace(/^video_video_/, 'video_'), {
      media_id, brand_slug, ...event_data,
    }, { leadId: lead_id });
  }

  return res.json({ ok: true });
}
