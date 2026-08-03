import { getSupabaseAdmin } from '@/lib/supabase';
import { addGHLTags, upsertGHLContact } from '@/lib/ghl';

/**
 * POST /api/watch/not-watched   (public — identified by opaque lead token)
 * Body: { token, brand }
 *
 * Fired when a lead answers "Not yet" to "Did you watch the video?". Tags them
 * differently in GHL so a separate nurture can prompt them to watch, instead of
 * letting them book a call without having seen the video.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, brand } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });

  const supabase = getSupabaseAdmin();
  const { data: lead } = await supabase
    .from('leads').select('id, email, ghl_contact_id, brand_slug').eq('token', token).maybeSingle();
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  const slug = (brand || lead.brand_slug || 'general').toLowerCase();
  const tags = [`${slug}-video-not-watched`, 'video-not-watched'];

  await supabase.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', lead.id);

  // Best-effort GHL tag: by contact id if we have it, else upsert by email.
  try {
    if (lead.ghl_contact_id) {
      await addGHLTags(lead.ghl_contact_id, tags);
    } else if (lead.email && process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID) {
      await upsertGHLContact({ locationId: process.env.GHL_LOCATION_ID, email: lead.email, tags });
    }
  } catch (e) {
    console.error('[watch/not-watched] GHL tag error:', e.message);
  }

  return res.json({ ok: true });
}
