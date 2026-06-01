import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/prospect-disposition
 *
 * Records a prospecting call disposition as a lead_event.
 * Body: { lead_id, disposition, notes? }
 *
 * disposition values:
 *   no_answer       — called, no answer
 *   left_vm         — left a voicemail
 *   booked          — call resulted in a booking
 *   not_interested  — lead not interested
 *   follow_up       — spoke, needs follow up
 *   skipped         — rep skipped this lead in the queue
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { lead_id, disposition, notes } = req.body;
  if (!lead_id || !disposition) {
    return res.status(400).json({ error: 'lead_id and disposition are required' });
  }

  const VALID = ['no_answer', 'left_vm', 'booked', 'not_interested', 'follow_up', 'skipped'];
  if (!VALID.includes(disposition)) {
    return res.status(400).json({ error: `disposition must be one of: ${VALID.join(', ')}` });
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('lead_events').insert({
    lead_id,
    event_type: `prospect_call_${disposition}`,
    metadata: {
      disposition,
      notes:       notes || null,
      rep_email:   session.user?.email || null,
      dispositioned_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
  });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}
