import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { runPersonIntel } from '@/lib/personIntel';

/**
 * Person Intel for a contact card — an individual dossier researched via
 * Perplexity Sonar.
 *
 * GET  /api/dashboard/person-intel?email=&lead_id=&ghl_contact_id=
 *   Cached read. Returns the stored person_intel row (status 'ok' only) plus a
 *   `researchable` flag so the card can show a "Research person" button. Never
 *   runs research.
 *
 * POST /api/dashboard/person-intel  { email, name?, phone?, company?, location?,
 *                                     lead_id?, ghl_contact_id?, force? }
 *   Runs (or force-refreshes) the dossier and returns the row.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const email        = (req.query.email || '').toString().trim().toLowerCase() || null;
    const leadId       = (req.query.lead_id || '').toString().trim() || null;
    const ghlContactId = (req.query.ghl_contact_id || '').toString().trim() || null;

    let row = null;
    if (email) {
      const { data } = await supabase.from('person_intel').select('*').eq('email', email).maybeSingle();
      row = data || null;
    }
    if (!row && leadId) {
      const { data } = await supabase.from('person_intel').select('*').eq('lead_id', leadId).maybeSingle();
      row = data || null;
    }
    if (!row && ghlContactId) {
      const { data } = await supabase.from('person_intel').select('*').eq('ghl_contact_id', ghlContactId).maybeSingle();
      row = data || null;
    }

    const intel = row && row.status === 'ok' ? row : null;
    // Researchable whenever we can identify the person and nothing usable is cached.
    const researchable = !intel && (!!email || !!leadId || !!ghlContactId);
    return res.json({ intel, researchable });
  }

  if (req.method === 'POST') {
    const {
      email = null, name = null, phone = null, company = null, location = null, brand = null,
      lead_id = null, ghl_contact_id = null, force = false,
    } = req.body || {};
    if (!email && !name) return res.status(400).json({ error: 'email or name is required' });

    const result = await runPersonIntel({
      email, name, phone, company, location, brand,
      leadId: lead_id, ghlContactId: ghl_contact_id, supabase, force: !!force,
    });

    const intel = result?.row && result.row.status === 'ok' ? result.row : null;
    return res.json({ status: result?.status || 'error', intel, error: result?.reason || result?.row?.error || null });
  }

  return res.status(405).end();
}
