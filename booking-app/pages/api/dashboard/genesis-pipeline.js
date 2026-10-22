import { getSupabaseAdmin } from '@/lib/supabase';
import { requirePipelineAccess } from '@/lib/scout/auth';
import { leadsToCsv, pipelineStats } from '@/lib/pipeline/dashboardStats.mjs';
import { NAME_SOURCE_CATALOG, NAME_SOURCES_NOT_USED } from '@/lib/pipeline/ownerGate.mjs';

const COLUMNS = 'id, external_id, source, stage, status, business_name, city, domain, website, owner_name, owner_first, owner_last, owner_role, owner_confidence, owner_sources, owner_source_urls, owner_phone, owner_phone_source, business_phone, email, inbox_type, email_source, verification, flagged_emails, icebreaker, icebreaker_sent, credits, calls, hold_reason, lookup_at, created_at, updated_at, signal';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requirePipelineAccess(req, res)) return;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('genesis_leads').select(COLUMNS).eq('dry_run', false).order('updated_at', { ascending: false }).limit(500);
    if (error) return res.status(500).json({ error: error.message });
    const leads = data || [];
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="genesis-leads.csv"');
      return res.status(200).send(leadsToCsv(leads));
    }
    return res.status(200).json({
      stats: pipelineStats(leads),
      leads,
      name_sources: NAME_SOURCE_CATALOG,
      name_sources_not_used: NAME_SOURCES_NOT_USED,
      sent: false,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load Genesis leads' });
  }
}
