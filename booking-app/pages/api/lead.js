import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/lead?t=TOKEN
 *
 * Returns the lead's contact info and form answers for pre-filling
 * the booking page. No auth required — the token itself is the secret.
 *
 * Response: { first_name, last_name, email, phone, investment_level, raw_fields }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { t } = req.query;
  if (!t) return res.status(400).json({ error: 'token required' });

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, phone, investment_level, raw_fields, status')
    .eq('token', t)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  // Return only what the booking page needs
  return res.json({
    id:               data.id,
    first_name:       data.first_name,
    last_name:        data.last_name,
    email:            data.email,
    phone:            data.phone,
    investment_level: data.investment_level,
    raw_fields:       data.raw_fields,
  });
}
