import crypto from 'node:crypto';

export function bearerMatches(supplied, secret) {
  if (!secret || typeof supplied !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/** Session, cron secret, or GENESIS_PIPELINE_SECRET. Internal calls are the orchestrator, not HTTP. */
export function pipelineAuthorized({ internal = false, session = null, authorization = '', cronSecret = '', pipelineSecret = '' } = {}) {
  if (internal) return true;
  if (session) return true;
  if (bearerMatches(authorization, cronSecret)) return true;
  if (pipelineSecret && pipelineSecret !== cronSecret && bearerMatches(authorization, pipelineSecret)) return true;
  return false;
}
