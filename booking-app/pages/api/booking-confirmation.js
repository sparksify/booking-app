import { getSupabaseAdmin } from '@/lib/supabase';
import { resolveConfirmation } from '@/lib/bookingConfirmation.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const details = await resolveConfirmation(getSupabaseAdmin(), req.body?.ref, req.body?.audience);
    return details ? res.json(details) : res.status(404).json({ error: 'Confirmation unavailable or expired' });
  } catch { return res.status(503).json({ error: 'Confirmation temporarily unavailable' }); }
}
