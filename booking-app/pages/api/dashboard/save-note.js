import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { lookupGHLContactByEmail, addGHLNote, updateGHLNote } from '@/lib/ghl';

/**
 * POST /api/dashboard/save-note
 *
 * Body: { email, notes }
 *
 * Persists a contact's notes keyed by email — independent of whether a `leads`
 * row exists (most real contacts live in GHL, not the leads table). Also pushes
 * the note to the contact's HighLevel record: created once, then updated in
 * place on later saves (we store the GHL note id so we don't spam new notes).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { email, notes } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const supabase = getSupabaseAdmin();
  const now      = new Date().toISOString();
  const body     = notes ?? '';

  // Read any existing note row first so we know the GHL note id to update.
  const { data: existing } = await supabase
    .from('contact_notes')
    .select('ghl_note_id')
    .eq('email', email)
    .maybeSingle();

  // ── Sync to HighLevel ──────────────────────────────────────────────────────
  let ghlNoteId = existing?.ghl_note_id ?? null;
  let ghlSynced = false;
  try {
    if (process.env.GHL_API_KEY && body.trim()) {
      const contact   = await lookupGHLContactByEmail(email).catch(() => null);
      const contactId = contact?.id ?? null;
      if (contactId) {
        if (ghlNoteId) {
          const upd = await updateGHLNote(contactId, ghlNoteId, body);
          ghlSynced = !!upd;
          // If the stored note id is stale (deleted in GHL), recreate it.
          if (!upd) {
            const created = await addGHLNote(contactId, body);
            ghlNoteId = created?.note?.id ?? null;
            ghlSynced = !!ghlNoteId;
          }
        } else {
          const created = await addGHLNote(contactId, body);
          ghlNoteId = created?.note?.id ?? null;
          ghlSynced = !!ghlNoteId;
        }
        if (!ghlSynced) console.error('[save-note] GHL note sync failed for', email);
      } else {
        console.warn('[save-note] no GHL contact found for', email);
      }
    }
  } catch (e) {
    console.error('[save-note] GHL note sync error:', e.message);
  }

  // ── Persist locally (always) ───────────────────────────────────────────────
  const { error } = await supabase
    .from('contact_notes')
    .upsert(
      { email, notes: body, ghl_note_id: ghlNoteId, updated_by: session.user?.email || 'dashboard', updated_at: now },
      { onConflict: 'email' }
    );
  if (error) return res.status(500).json({ error: error.message });

  // Best-effort mirror to the most recent matching lead, if one exists.
  await supabase
    .from('leads')
    .update({ notes: body, updated_at: now })
    .eq('email', email)
    .then(() => {});

  res.json({ ok: true, ghlSynced });
}
