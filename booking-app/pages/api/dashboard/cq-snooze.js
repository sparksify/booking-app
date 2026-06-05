import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/cq-snooze
 *
 * Body: { email, slot_start, days }  — snooze this CQ out of the recovery queue
 *        { email, slot_start, clear: true } — un-snooze
 *
 * Stored on meeting_status_overrides.cq_snoozed_until (keyed by email + slot).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { email, slot_start, days, clear } = req.body;
  if (!email || !slot_start) return res.status(400).json({ error: 'email and slot_start required' });

  const now   = new Date();
  const until = clear ? null : new Date(now.getTime() + (Number(days) || 3) * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('meeting_status_overrides')
    .upsert(
      { email, slot_start, cq_snoozed_until: until, updated_by: session.user?.email || 'dashboard', updated_at: now.toISOString() },
      { onConflict: 'email,slot_start' }
    );

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, snoozed_until: until });
}
