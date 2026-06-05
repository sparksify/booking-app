import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/save-note
 *
 * Body: { email, notes }
 *
 * Persists a contact's notes keyed by email — independent of whether a `leads`
 * row exists. Most real contacts live in GHL and have no leads row, so notes
 * must not depend on one. Also mirrors to leads.notes when a lead exists, so the
 * two stay in sync.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { email, notes } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const supabase = getSupabaseAdmin();
  const now      = new Date().toISOString();

  const { error } = await supabase
    .from('contact_notes')
    .upsert(
      { email, notes: notes ?? '', updated_by: session.user?.email || 'dashboard', updated_at: now },
      { onConflict: 'email' }
    );

  if (error) return res.status(500).json({ error: error.message });

  // Best-effort mirror to the most recent matching lead, if one exists.
  await supabase
    .from('leads')
    .update({ notes: notes ?? '', updated_at: now })
    .eq('email', email)
    .then(() => {});

  res.json({ ok: true });
}
