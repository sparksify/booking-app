import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

const VALID_STATUSES = ['scheduled', 'showed', 'qualified', 'lost'];

/**
 * PATCH /api/dashboard/leads
 * Body: { id, status, notes? }
 * Move a booking to a new pipeline stage.
 *
 * DELETE /api/dashboard/leads
 * Body: { id }
 * Remove a booking record.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  if (req.method === 'PATCH') {
    const { id, status, notes } = req.body;
    if (!id || !status) return res.status(400).json({ error: 'id and status required' });
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const update = { status };
    if (notes !== undefined) update.notes = notes;

    const { error } = await supabase
      .from('bookings')
      .update(update)
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  res.status(405).end();
}
