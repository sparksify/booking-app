import { dashboardAccess, dbData, receipt, submitIntake, loadIntake } from '@/lib/genesisIntakeServer';
import { intakeError } from '@/lib/genesisIntake.mjs';

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '32kb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const db = await dashboardAccess(req, res);
    if (req.method === 'POST') return res.status(202).json(await submitIntake(db, req.body, req.headers['idempotency-key']));
    if (req.method === 'PATCH') {
      if (typeof req.body?.id !== 'string' || !/^[a-f\d-]{36}$/i.test(req.body.id)) throw intakeError('A valid receipt id is required.');
      if (req.body.action === 'outreach') return res.status(200).json(await loadIntake(db, req.body.id));
      if (req.body.action !== 'retry') throw intakeError('Unknown action.');
      const row = dbData(await db.from('genesis_intake').update({ status: 'queued', attempts: 0, last_error: null, updated_at: new Date().toISOString() })
        .eq('id', req.body.id).eq('status', 'failed').select().maybeSingle());
      if (!row) throw intakeError('Only failed submissions can be retried.', 409);
      return res.status(200).json(receipt(row));
    }
    const rows = dbData(await db.from('genesis_intake').select('*').order('created_at', { ascending: false }).limit(100));
    return res.status(200).json({ submissions: rows.map(receipt), api_configured: !!process.env.GENESIS_INTAKE_API_KEY });
  } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Genesis intake is unavailable.' }); }
}
