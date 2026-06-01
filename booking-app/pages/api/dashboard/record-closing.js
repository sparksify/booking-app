import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/record-closing
 *
 * Records a closed deal with full attribution (advisor, bucket, franchise, commission).
 *
 * Body: { lead_id, booking_id?, bucket, franchise_brand?, commission }
 * Response: { closing: { id, lead_id, advisor_email, bucket, franchise_brand, commission, closed_at } }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { lead_id, booking_id, bucket, franchise_brand, commission } = req.body;
  if (!lead_id)   return res.status(400).json({ error: 'lead_id is required' });
  if (!commission) return res.status(400).json({ error: 'commission is required' });

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('closings')
    .insert({
      lead_id,
      booking_id:     booking_id     || null,
      advisor_email:  session.user.email,
      bucket:         bucket         || null,
      franchise_brand: franchise_brand || null,
      commission:     parseFloat(String(commission).replace(/[^0-9.]/g, '')) || 0,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Mark lead as closed in leads table
  await supabase.from('leads').update({ status: 'closed' }).eq('id', lead_id);

  return res.json({ closing: data });
}
