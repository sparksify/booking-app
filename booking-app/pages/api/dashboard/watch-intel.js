import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/watch-intel?ghl_contact_id=&lead_id=&email=
 *
 * Returns a lead's video-watch progress + funnel questionnaire answers, for the
 * contact card. Matches by lead id, then GHL contact id, then email.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabaseAdmin();
  const ghlContactId = (req.query.ghl_contact_id || '').toString().trim() || null;
  const leadId       = (req.query.lead_id || '').toString().trim() || null;
  const email        = (req.query.email || '').toString().trim().toLowerCase() || null;

  const cols = 'video_watch_pct, video_watch_seconds, video_last_watched_at, franchise_city, franchise_state, operated_business, net_worth, investment_level, questionnaire_completed_at';

  let lead = null;
  if (leadId) {
    ({ data: lead } = await supabase.from('leads').select(cols).eq('id', leadId).maybeSingle());
  }
  if (!lead && ghlContactId) {
    ({ data: lead } = await supabase.from('leads').select(cols).eq('ghl_contact_id', ghlContactId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle());
  }
  if (!lead && email) {
    ({ data: lead } = await supabase.from('leads').select(cols).ilike('email', email)
      .order('created_at', { ascending: false }).limit(1).maybeSingle());
  }

  if (!lead) return res.json({ watch: null });
  return res.json({ watch: lead });
}
