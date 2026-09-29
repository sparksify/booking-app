import { getSupabaseAdmin } from '@/lib/supabase';
import { hasBearer, submitIntake, receipt, dbData } from '@/lib/genesisIntakeServer';
import { intakeError } from '@/lib/genesisIntake.mjs';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!hasBearer(req, process.env.GENESIS_INTAKE_API_KEY)) return res.status(401).json({ error: 'A valid Genesis bearer token is required.' });
  try {
    const db = getSupabaseAdmin();
    if (req.method === 'POST') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw intakeError('Content-Type must be application/json.', 415);
      const result = await submitIntake(db, req.body, req.headers['idempotency-key']);
      return res.status(result.duplicate ? 200 : 202).json(result);
    }
    if (typeof req.query.id !== 'string' || !/^[a-f\d-]{36}$/i.test(req.query.id)) throw intakeError('A valid receipt id is required.');
    const row = dbData(await db.from('genesis_intake').select('*').eq('id', req.query.id).maybeSingle());
    if (!row) throw intakeError('Submission not found.', 404);
    return res.status(200).json(receipt(row));
  } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Genesis intake is unavailable.' }); }
}
