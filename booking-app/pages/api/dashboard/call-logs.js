import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { lookupGHLContactByEmail } from '@/lib/ghl';

/**
 * GET /api/dashboard/call-logs?ghl_contact_id=&lead_id=&email=
 *
 * Returns the Granola call logs for a contact, newest first. Matches by GHL
 * contact id and/or Supabase lead id (email is resolved to a lead id when the
 * caller doesn't have one). Most sales prospects are GHL-only, so the GHL
 * contact id is the primary key here.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabaseAdmin();
  let   ghlContactId = (req.query.ghl_contact_id || '').toString().trim() || null;
  let   leadId       = (req.query.lead_id || '').toString().trim() || null;
  let   email        = (req.query.email || '').toString().trim().toLowerCase() || null;

  // Resolve a lead id from the email when we weren't handed one.
  if (!leadId && email) {
    const { data: lead } = await supabase
      .from('leads').select('id').ilike('email', email)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    leadId = lead?.id || null;
  }

  // Granola rows are often keyed only by ghl_contact_id (the call matched a GHL
  // contact but not a lead, or the lead has no ghl_contact_id stored). If the
  // card only handed us a lead/email, resolve the GHL contact from the email so
  // those calls still surface. Backfill the lead's email if we started from an id.
  if (!ghlContactId) {
    if (!email && leadId) {
      const { data: lead } = await supabase.from('leads').select('email').eq('id', leadId).maybeSingle();
      email = lead?.email?.toLowerCase() || null;
    }
    if (email) {
      try { ghlContactId = await lookupGHLContactByEmail(email).then(c => c?.id || null); } catch { /* best-effort */ }
    }
  }

  if (!ghlContactId && !leadId) return res.json({ calls: [] });

  const ors = [];
  if (ghlContactId) ors.push(`ghl_contact_id.eq.${ghlContactId}`);
  if (leadId)       ors.push(`lead_id.eq.${leadId}`);

  const { data, error } = await supabase
    .from('call_logs')
    .select('id, granola_note_url, note_title, call_started_at, summary, transcript, prospect_name, sentiment, interest_level, topics_discussed, objections, action_items_steve, next_step, follow_up_date, disqualifiers')
    .or(ors.join(','))
    .order('call_started_at', { ascending: false })
    .limit(25);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ calls: data || [] });
}
