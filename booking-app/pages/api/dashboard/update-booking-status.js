import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  addGHLTags,
  lookupGHLContactByEmail,
  getGHLContactOpportunity,
  updateGHLOpportunityStage,
} from '@/lib/ghl';

/**
 * POST /api/dashboard/update-booking-status
 *
 * Body: { bookingId, email, status }
 *   status: 'showed' | 'no-show' | 'closed'
 *
 * Actions:
 *   1. Update bookings.status in Supabase
 *   2. Update leads.status in Supabase (matched by email)
 *   3. Add GHL tag
 *   4. Update GHL opportunity stage (if stage env var set)
 *
 * Required env vars for GHL stage sync (optional — skipped if missing):
 *   GHL_STAGE_SHOWED      — GHL pipeline stage ID for "Showed"
 *   GHL_STAGE_NO_SHOW     — GHL pipeline stage ID for "No Show"
 *   GHL_STAGE_CLOSED_WON  — GHL pipeline stage ID for "Closed Won"
 */

const STATUS_MAP = {
  showed:   { tag: 'showed',     leadStatus: 'showed',    stageEnv: 'GHL_STAGE_SHOWED'     },
  'no-show':{ tag: 'no-show',    leadStatus: 'no-show',   stageEnv: 'GHL_STAGE_NO_SHOW'    },
  closed:   { tag: 'closed-won', leadStatus: 'qualified', stageEnv: 'GHL_STAGE_CLOSED_WON' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { bookingId, email, status } = req.body;
  if (!bookingId || !email || !status) {
    return res.status(400).json({ error: 'Missing bookingId, email, or status' });
  }
  if (!STATUS_MAP[status]) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  const { tag, leadStatus, stageEnv } = STATUS_MAP[status];
  const supabase = getSupabaseAdmin();
  const errors   = [];

  // 1. Update booking status
  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId);
  if (bookingErr) errors.push(`booking update: ${bookingErr.message}`);

  // 2. Update lead status (by email — most recent matching lead)
  const { data: leads } = await supabase
    .from('leads')
    .select('id, ghl_contact_id')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1);

  const lead = leads?.[0] ?? null;
  if (lead) {
    const { error: leadErr } = await supabase
      .from('leads')
      .update({ status: leadStatus, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (leadErr) errors.push(`lead update: ${leadErr.message}`);
  }

  // 3 + 4. GHL tag + opportunity stage (best-effort, non-blocking)
  try {
    // Resolve GHL contact ID — use stored one or look up by email
    let ghlContactId = lead?.ghl_contact_id ?? null;
    if (!ghlContactId && process.env.GHL_API_KEY) {
      const contact = await lookupGHLContactByEmail(email);
      ghlContactId = contact?.id ?? null;
    }

    if (ghlContactId) {
      // Add tag
      await addGHLTags(ghlContactId, [tag]).catch(e =>
        errors.push(`GHL tag: ${e.message}`)
      );

      // Update opportunity stage if stage ID env var is set
      const stageId = process.env[stageEnv];
      if (stageId) {
        const opp = await getGHLContactOpportunity(ghlContactId).catch(() => null);
        if (opp?.id) {
          await updateGHLOpportunityStage(opp.id, stageId).catch(e =>
            errors.push(`GHL stage: ${e.message}`)
          );
        }
      }
    }
  } catch (ghlErr) {
    errors.push(`GHL: ${ghlErr.message}`);
  }

  res.json({ ok: true, status, errors: errors.length ? errors : undefined });
}
