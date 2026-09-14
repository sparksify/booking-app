import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/dealos-deal-update
 *
 * Patches a single deal (nurture_brands row) by id — the DealOS counterpart to
 * nurture-brand.js, which upserts by (client, brand_name) and can't safely
 * update deal-level fields.
 *
 * Body: { id, ...fields } where fields ⊆ ALLOWED below.
 *
 * Side effects:
 *   - deal_status → 'submitted' stamps submitted_at (if unset)
 *   - deal_status → 'connected' stamps connected_at (if unset)
 *   - setting outcome stamps closed_at (if unset)
 *   - clearing waiting_on clears waiting_since/waiting_note
 */
const ALLOWED = [
  'deal_status', 'estimated_commission', 'submitted_at', 'connected_at',
  'sentiment', 'developer_sentiment', 'note', 'stage',
  'developer_name', 'developer_phone', 'developer_email',
  'next_action_type', 'next_action_note', 'next_action_due_at',
  'waiting_on', 'waiting_since', 'waiting_note',
  'next_event_type', 'next_event_at',
  'stalled_reason', 'outcome', 'closed_at',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { id, ...fields } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });

  const patch = {};
  for (const k of ALLOWED) if (fields[k] !== undefined) patch[k] = fields[k];
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields to update' });

  const now = new Date().toISOString();
  patch.updated_at = now;

  if (patch.deal_status === 'submitted' && patch.submitted_at === undefined) patch.submitted_at = now;
  if (patch.deal_status === 'connected' && patch.connected_at === undefined) patch.connected_at = now;
  if (patch.outcome && patch.closed_at === undefined) patch.closed_at = now;
  if (patch.waiting_on === null) { patch.waiting_since = null; patch.waiting_note = null; }
  else if (patch.waiting_on && patch.waiting_since === undefined) patch.waiting_since = now;

  const supabase = getSupabaseAdmin();
  const { data: deal, error } = await supabase
    .from('nurture_brands')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ deal });
}
