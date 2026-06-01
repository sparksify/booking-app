import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/nurture-update
 *
 * Updates top-level fields on a nurture client record.
 *
 * Body: {
 *   id:                  string (nurture_client_id),
 *   status?:             'active'|'closed'|'archived',
 *   funding_intro_done?: boolean,
 *   notes?:              string,
 * }
 *
 * Returns: { client }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { id, status, funding_intro_done, notes } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  const patch = {};
  if (status             !== undefined) patch.status             = status;
  if (funding_intro_done !== undefined) patch.funding_intro_done = funding_intro_done;
  if (notes              !== undefined) patch.notes              = notes;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('nurture_clients')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ client: data });
}
