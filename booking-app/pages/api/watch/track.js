import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/watch/track   (public — identified by opaque lead token)
 * Body: { token, pct, seconds }
 *
 * Records how far the lead has watched the Wistia video. Keeps the MAX watched
 * so a rewatch/scrub never lowers the number. Fires frequently from the player;
 * kept intentionally tiny.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, pct, seconds } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });

  const supabase = getSupabaseAdmin();
  const { data: lead } = await supabase
    .from('leads').select('id, video_watch_pct, video_watch_seconds').eq('token', token).maybeSingle();
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  const nextPct = Math.max(Number(lead.video_watch_pct || 0), Math.round(Number(pct) || 0));
  const nextSec = Math.max(Number(lead.video_watch_seconds || 0), Math.round(Number(seconds) || 0));

  await supabase.from('leads').update({
    video_watch_pct:       Math.min(100, nextPct),
    video_watch_seconds:   nextSec,
    video_last_watched_at: new Date().toISOString(),
  }).eq('id', lead.id);

  // Optional: mirror the % onto a GHL custom field for workflow triggers.
  try {
    const key = process.env.GHL_FIELD_VIDEO_PCT;
    if (key && process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID) {
      const { data: l2 } = await supabase.from('leads').select('ghl_contact_id').eq('id', lead.id).maybeSingle();
      if (l2?.ghl_contact_id) {
        await fetch(`https://services.leadconnectorhq.com/contacts/${l2.ghl_contact_id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${process.env.GHL_API_KEY}`, 'Version': '2021-07-28', 'Content-Type': 'application/json' },
          body: JSON.stringify({ customFields: [{ key, field_value: String(Math.min(100, nextPct)) }] }),
        }).catch(() => {});
      }
    }
  } catch { /* best-effort */ }

  return res.json({ ok: true });
}
