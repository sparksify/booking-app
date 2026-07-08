import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { runCompanyIntel, extractDomain, isBusinessDomain } from '@/lib/companyIntel';

/**
 * Company Intel for a contact card.
 *
 * GET  /api/dashboard/company-intel?email=&ghl_contact_id=&lead_id=
 *   Cached read. Resolves the domain from the email and returns the stored
 *   company_intel row. Never runs enrichment. Returns { intel: null } when
 *   there's nothing yet, plus a `researchable` flag so the UI can show a
 *   "Research company" button for business domains.
 *
 * POST /api/dashboard/company-intel  { email, ghl_contact_id?, lead_id?, force? }
 *   Runs (or force-refreshes) enrichment for the contact and returns the row.
 *   Used by the manual "Research" button; new leads are auto-researched at ingest.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const email        = (req.query.email || '').toString().trim().toLowerCase() || null;
    const ghlContactId = (req.query.ghl_contact_id || '').toString().trim() || null;
    const leadId       = (req.query.lead_id || '').toString().trim() || null;
    const domain       = extractDomain(email);

    let row = null;
    if (domain) {
      const { data } = await supabase
        .from('company_intel').select('*').eq('domain', domain).maybeSingle();
      row = data || null;
    }
    if (!row && ghlContactId) {
      const { data } = await supabase
        .from('company_intel').select('*').eq('ghl_contact_id', ghlContactId).maybeSingle();
      row = data || null;
    }

    // Only surface "ok" rows to the card; freemail/no_site/error stay hidden but
    // still count as cached so we don't offer to re-research a dead domain.
    const intel = row && row.status === 'ok' ? row : null;
    const researchable = !intel && isBusinessDomain(domain) && !row;
    return res.json({ intel, researchable, domain: domain || null });
  }

  if (req.method === 'POST') {
    const { email, ghl_contact_id = null, lead_id = null, force = false } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });

    const result = await runCompanyIntel({
      email, ghlContactId: ghl_contact_id, leadId: lead_id, supabase, force: !!force,
    });

    const intel = result?.row && result.row.status === 'ok' ? result.row : null;
    return res.json({ status: result?.status || 'error', intel });
  }

  return res.status(405).end();
}
