import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/nurture-touchpoint
 *
 * Logs a contact touchpoint. DealOS extension: touchpoints can be linked to a
 * specific deal and are split by party so Last Candidate Contact and Last
 * Developer Contact track independently.
 *
 * Body: {
 *   nurture_client_id,
 *   medium: 'call'|'email'|'text'|'note'|'meeting'   ('notes'/'sms' normalized)
 *   note?,
 *   deal_id?,                    — link to a nurture_brands (deal) row
 *   party?: 'candidate'|'developer'  (default 'candidate')
 * }
 *
 * Returns: { touchpoint, last_contacted_at }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { nurture_client_id, medium: rawMedium, note, deal_id, party: rawParty } = req.body;
  if (!nurture_client_id || !rawMedium) {
    return res.status(400).json({ error: 'nurture_client_id and medium required' });
  }

  const mediumMap = { notes: 'note', sms: 'text' };
  const medium = mediumMap[rawMedium] || rawMedium;
  if (!['call', 'email', 'text', 'note', 'meeting'].includes(medium)) {
    return res.status(400).json({ error: `Invalid medium: ${rawMedium}` });
  }
  const party = rawParty === 'developer' ? 'developer' : 'candidate';

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: touchpoint, error } = await supabase
    .from('nurture_touchpoints')
    .insert({
      nurture_client_id,
      medium,
      note: note || null,
      deal_id: deal_id || null,
      party,
      created_by: session.user.email,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Notes don't reset contact clocks; real outreach does.
  const isContact = medium !== 'note';
  const updates = [];
  if (isContact && party === 'candidate') {
    updates.push(supabase.from('nurture_clients')
      .update({ last_contacted_at: now }).eq('id', nurture_client_id));
  }
  if (isContact && deal_id) {
    const col = party === 'developer' ? 'last_developer_contact_at' : 'last_candidate_contact_at';
    updates.push(supabase.from('nurture_brands')
      .update({ [col]: now }).eq('id', deal_id));
  }
  if (updates.length) await Promise.all(updates);

  return res.json({ touchpoint, last_contacted_at: isContact && party === 'candidate' ? now : undefined });
}
