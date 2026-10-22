export const config = { maxDuration: 300 };

import { requirePipelineAccess } from '@/lib/scout/auth';
import { executeGenesis } from '@/lib/pipeline/runGenesis';
import { NAME_SOURCE_CATALOG, NAME_SOURCES_NOT_USED } from '@/lib/pipeline/ownerGate.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requirePipelineAccess(req, res)) return;
  try {
    const result = await executeGenesis(req.body || {});
    return res.status(200).json({ ...result, sent: false, name_sources: NAME_SOURCE_CATALOG, name_sources_not_used: NAME_SOURCES_NOT_USED });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Genesis run failed' });
  }
}
