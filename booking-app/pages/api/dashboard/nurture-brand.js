import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/nurture-brand
 *
 * Upserts a brand record for a nurture client.
 * If the brand already exists (by nurture_client_id + brand_name), updates it.
 * Otherwise inserts a new row.
 *
 * Body: {
 *   nurture_client_id,
 *   brand_name,
 *   stage?:           1–5,
 *   sentiment?:       'positive'|'neutral'|'concerns'|'passed',
 *   note?:            string,
 *   developer_name?:  string,
 *   developer_phone?: string,
 *   developer_email?: string,
 * }
 *
 * Returns: { brand }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const {
    nurture_client_id, brand_name,
    stage, sentiment, note,
    developer_name, developer_phone, developer_email,
  } = req.body;

  if (!nurture_client_id || !brand_name) {
    return res.status(400).json({ error: 'nurture_client_id and brand_name required' });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('nurture_brands')
    .upsert(
      {
        nurture_client_id,
        brand_name,
        ...(stage           !== undefined ? { stage }           : {}),
        ...(sentiment       !== undefined ? { sentiment }       : {}),
        ...(note            !== undefined ? { note }            : {}),
        ...(developer_name  !== undefined ? { developer_name }  : {}),
        ...(developer_phone !== undefined ? { developer_phone } : {}),
        ...(developer_email !== undefined ? { developer_email } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'nurture_client_id,brand_name' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ brand: data });
}
