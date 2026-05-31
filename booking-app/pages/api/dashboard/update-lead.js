import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/update-lead
 *
 * Body: { id, franchise_brand?, developer_name?, developer_phone?, developer_email?, notes? }
 * Updates CRM/franchise fields on a lead record.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { id, franchise_brand, developer_name, developer_phone, developer_email, notes } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  const supabase = getSupabaseAdmin();

  const updates = {
    updated_at: new Date().toISOString(),
  };
  if (franchise_brand  !== undefined) updates.franchise_brand  = franchise_brand;
  if (developer_name   !== undefined) updates.developer_name   = developer_name;
  if (developer_phone  !== undefined) updates.developer_phone  = developer_phone;
  if (developer_email  !== undefined) updates.developer_email  = developer_email;
  if (notes            !== undefined) updates.notes            = notes;

  const { error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
}
