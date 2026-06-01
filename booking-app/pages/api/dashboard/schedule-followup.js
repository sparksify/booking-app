import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { lookupGHLContactByEmail, addGHLNote } from '@/lib/ghl';

/**
 * POST /api/dashboard/schedule-followup
 *
 * Body: {
 *   booking_id?:    string,
 *   lead_id?:       string,
 *   email:          string,
 *   follow_up_date: string   (YYYY-MM-DD),
 *   note?:          string,
 *   temperature?:   1–5,
 * }
 *
 * Saves to Supabase `followups` table.
 * Also adds a note to the GHL contact (if found).
 */

const TEMP_LABELS = ['', 'Cold', 'Cool', 'Warm', 'Hot', 'On Fire'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { booking_id, lead_id, email, follow_up_date, note, temperature } = req.body;
  if (!email || !follow_up_date) {
    return res.status(400).json({ error: 'email and follow_up_date required' });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('followups')
    .insert({
      booking_id:     booking_id     || null,
      lead_id:        lead_id        || null,
      email,
      follow_up_date,
      note:           note           || null,
      temperature:    temperature    || null,
      created_by:     session.user.email,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Mirror as a GHL note (best-effort, non-blocking)
  try {
    const contact = await lookupGHLContactByEmail(email);
    if (contact?.id) {
      const tempLabel = temperature ? TEMP_LABELS[temperature] : null;
      const noteBody  = [
        `Follow-up scheduled: ${follow_up_date}`,
        tempLabel ? `Likelihood: ${tempLabel} (${temperature}/5)` : null,
        note ? `Note: ${note}` : null,
        `Scheduled by: ${session.user.email}`,
      ].filter(Boolean).join('\n');
      await addGHLNote(contact.id, noteBody);
    }
  } catch (_) { /* non-critical */ }

  return res.json({ followup: data });
}
