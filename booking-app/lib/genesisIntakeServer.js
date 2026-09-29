import crypto from 'node:crypto';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getPermissions } from '@/lib/role';
import { normalizeIntake, firstStage, intakeError, verifiedResult, finalStatus } from './genesisIntake.mjs';
import { readPublicPage } from './genesisPublicPage';
import { discoverOne } from '@/pages/api/pipeline/discover';
import { enrichOne, verifyEmail } from '@/pages/api/pipeline/enrich';
import { outreachOne } from '@/pages/api/pipeline/outreach';

export function hasBearer(req, secret) {
  const value = req.headers?.authorization;
  if (!secret || typeof value !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function dbData(result) {
  if (result.error) throw intakeError('Genesis could not save or read this submission. Please retry.', 503);
  return result.data;
}

export async function dashboardAccess(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) throw intakeError('Sign in to Kanso.', 401);
  const db = getSupabaseAdmin();
  const email = session.user.email.toLowerCase();
  const member = dbData(await db.from('team_members').select('email').eq('email', email).eq('active', true).maybeSingle());
  const perms = await getPermissions(email);
  if (!member || !perms.page_pipeline) throw intakeError('Genesis access is required.', 403);
  if (req.method !== 'GET' && (req.headers.origin !== new URL(process.env.NEXTAUTH_URL).origin ||
    !String(req.headers['content-type'] || '').startsWith('application/json'))) throw intakeError('Invalid request origin.', 403);
  return db;
}

export function receipt(row) {
  return { id: row.id, status: row.status, stage: row.stage,
    business_name: row.payload.business_name, owner_name: row.result?.owner_name || row.payload.owner_name,
    email: row.result?.email || row.payload.email, phone: row.payload.phone,
    website: row.payload.website, city: row.payload.city,
    research_notes: row.payload.research_notes, franchise_information: row.payload.franchise_information,
    verification: row.result?.verification || null,
    outcome: row.status === 'complete' ? row.result?.outreach_status || finalStatus(row.result || {}) : null,
    last_error: row.last_error, created_at: row.created_at,
    status_url: `/api/genesis/intake?id=${row.id}`,
  };
}

export async function loadIntake(db, id) {
  if (!process.env.SMARTLEAD_API_KEY || !process.env.SMARTLEAD_CAMPAIGN_ID || !process.env.ANTHROPIC_API_KEY) throw intakeError('Outreach is not configured.', 503);
  const row = dbData(await db.from('genesis_intake').select('*').eq('id', id).single());
  if (row.status !== 'complete' || finalStatus(row.result || {}) !== 'ready_for_review') throw intakeError('This lead has not passed email verification.', 409);
  const claim = dbData(await db.from('pipeline_prospects').update({ smartlead_status: 'loading' }).eq('id', id)
    .eq('smartlead_status', 'ready_for_review').select('id').maybeSingle());
  if (!claim) throw intakeError('This lead is already being loaded or has already been processed. Check the campaign before retrying.', 409);
  let result = { ...row.result, outreach_status: 'outreach_needs_review' };
  try {
    // Fail closed when the existing campaign check cannot be completed.
    const response = await fetch(`https://server.smartlead.ai/api/v1/leads?${new URLSearchParams({ api_key: process.env.SMARTLEAD_API_KEY, email: row.result.email })}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Campaign check unavailable');
    const matches = await response.json();
    if (!Array.isArray(matches)) throw new Error('Unexpected campaign response');
    result = matches.length ? { ...row.result, outreach_status: 'skipped_duplicate' } : await outreachOne(row.result);
  } catch { /* Ambiguous sends remain held for manual campaign reconciliation. */ }
  dbData(await db.from('pipeline_prospects').update({ loaded: result.outreach_status === 'loaded', smartlead_status: result.outreach_status }).eq('id', id));
  dbData(await db.from('genesis_intake').update({ result, updated_at: new Date().toISOString() }).eq('id', id));
  return receipt({ ...row, result });
}

export async function submitIntake(db, body, requestKey) {
  if (typeof requestKey !== 'string' || !/^[A-Za-z0-9_.:-]{8,200}$/.test(requestKey)) throw intakeError('Idempotency-Key is required (8–200 letters, digits, dots, colons, dashes or underscores).');
  const payload = normalizeIntake(body);
  const payload_hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const inserted = await db.from('genesis_intake').insert({ request_key: requestKey, payload_hash, payload, stage: firstStage(payload) }).select().single();
  if (inserted.error?.code === '23505') {
    const existing = dbData(await db.from('genesis_intake').select('*').eq('request_key', requestKey).single());
    if (existing.payload_hash !== payload_hash) throw intakeError('This Idempotency-Key was used for different lead data. Use a new key for a corrected submission.', 409);
    return { ...receipt(existing), duplicate: true };
  }
  return { ...receipt(dbData(inserted)), duplicate: false };
}

// A database compare-and-set claims one stage. Each stage is checkpointed before
// the next cron tick, so serverless termination never loses the submitted lead.
export async function processIntake(db, candidate, deps = {}) {
  const now = new Date().toISOString();
  const claimed = dbData(await db.from('genesis_intake').update({ status: 'processing', updated_at: now, attempts: candidate.attempts + 1 })
    .eq('id', candidate.id).eq('status', candidate.status).eq('updated_at', candidate.updated_at).select().maybeSingle());
  if (!claimed) return;
  const update = async patch => dbData(await db.from('genesis_intake').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', claimed.id).eq('status', 'processing').eq('updated_at', now));
  try {
    const input = claimed.result || claimed.payload;
    let result, stage;
    if (claimed.stage === 'verify') {
      result = verifiedResult(input, await (deps.verifyEmail || verifyEmail)(input.email, { strict: true })); stage = 'save';
    } else if (claimed.stage === 'discover') {
      if (!deps.discoverOne && !process.env.ANTHROPIC_API_KEY) throw new Error('Discovery unavailable');
      result = await (deps.discoverOne || discoverOne)(input, { readPage: readPublicPage }); stage = 'enrich';
    } else if (claimed.stage === 'enrich') {
      result = await (deps.enrichOne || enrichOne)(input); stage = 'save';
    } else {
      result = input;
      const outcome = finalStatus(result);
      // The receipt UUID is also the prospect UUID: retries cannot insert duplicates.
      dbData(await db.from('pipeline_prospects').upsert({
        id: claimed.id, business_name: result.business_name, city: result.city, industry: result.industry,
        owner_name: result.owner_name || result.email_owner, email: result.email,
        website: result.website, domain: result.domain, phone: result.phone,
        email_source: result.email_source, verification: result.verification,
        signals: [result.signal, claimed.payload.research_notes, claimed.payload.franchise_information].filter(Boolean),
        enriched: !!result.email, loaded: false, smartlead_status: outcome,
      }, { onConflict: 'id', ignoreDuplicates: true }));
      await update({ status: 'complete', result: { ...result, loadable: outcome === 'ready_for_review' }, attempts: 0, last_error: null });
      return;
    }
    await update({ status: 'queued', stage, result, attempts: 0, last_error: null });
  } catch {
    await update({ status: claimed.attempts >= 3 ? 'failed' : 'queued', last_error: 'Processing could not finish. Genesis will retry up to three times per stage.' });
  }
}
