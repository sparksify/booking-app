import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/lead-detail?email=xxx
 * Returns the most recent lead for a given email, with all CRM fields.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });

  const supabase = getSupabaseAdmin();

  const { data: lead, error } = await supabase
    .from('leads')
    .select(`
      id, first_name, last_name, email, phone,
      investment_level, status, ghl_contact_id,
      franchise_brand, developer_name, developer_phone, developer_email, notes,
      franchise_interests,
      fb_form_id, fb_ad_id, fb_campaign_id,
      raw_fields, created_at,
      location_raw, location_city, location_state, location_zip, location_area_code,
      bookings (
        id, slot_start, slot_end, assigned_to_email, meet_link, status, investment_level
      )
    `)
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: error.message });
  }

  // Notes are stored per-contact by email (works even when no lead row exists).
  const { data: noteRow } = await supabase
    .from('contact_notes')
    .select('notes')
    .eq('email', email)
    .maybeSingle();

  const notes = noteRow?.notes ?? lead?.notes ?? '';
  if (lead) lead.notes = notes;

  res.json({ lead: lead || null, notes });
}
