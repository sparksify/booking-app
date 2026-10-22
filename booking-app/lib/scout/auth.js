import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { bearerMatches, pipelineAuthorized } from '@/lib/pipeline/authDecision.mjs';

export async function requireScoutUser(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return session;
}

export function validCron(req) {
  return bearerMatches(req.headers?.authorization || '', process.env.CRON_SECRET || '');
}

/** Logged-in session, CRON_SECRET, or GENESIS_PIPELINE_SECRET. Fails closed when none match. */
export async function requirePipelineAccess(req, res) {
  if (req.internal === true) return { internal: true };
  const session = await getServerSession(req, res, authOptions);
  const allowed = pipelineAuthorized({
    session,
    authorization: req.headers?.authorization || '',
    cronSecret: process.env.CRON_SECRET || '',
    pipelineSecret: process.env.GENESIS_PIPELINE_SECRET || '',
  });
  if (!allowed) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return session || { ok: true };
}
