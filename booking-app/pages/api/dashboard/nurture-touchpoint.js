import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/nurture-touchpoint
 *
 * Logs an outreach touchpoint and updates last_contacted_at on the nurture client.
 *
 * Body: { nurture_client_id, medium: 'call'|'email'|'text', note? }
 *
 * Returns: { touchpoint, last_contacted_at }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { nurture_client_id, medium, note } = req.body;
  if (!nurture_client_id || !medium) {
    return res.status(400).json({ error: 'nurture_client_id and medium required' });
  }

  const supabase   = getSupabaseAdmin();
  const now        = new Date().toISOString();

  const [{ data: touchpoint, error }, _] = await Promise.all([
    supabase
      .from('nurture_touchpoints')
      .insert({ nurture_client_id, medium, note: note || null, created_by: session.user.email })
      .select()
      .single(),
    supabase
      .from('nurture_clients')
      .update({ last_contacted_at: now })
      .eq('id', nurture_client_id),
  ]);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ touchpoint, last_contacted_at: now });
}
