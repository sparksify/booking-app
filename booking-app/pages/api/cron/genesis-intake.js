import { getSupabaseAdmin } from '@/lib/supabase';
import { hasBearer, dbData, processIntake } from '@/lib/genesisIntakeServer';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasBearer(req, process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return res.status(403).json({ error: 'Intake processing is production-only.' });
  try {
    const db = getSupabaseAdmin();
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    // Expired claims are retried; never run overlapping work for the same receipt.
    dbData(await db.from('genesis_intake').update({ status: 'failed', last_error: 'Processing timed out three times. Review before retrying.' }).eq('status', 'processing').lt('updated_at', stale).gte('attempts', 3));
    const candidates = dbData(await db.from('genesis_intake').select('*')
      .or(`status.eq.queued,and(status.eq.processing,updated_at.lt.${stale})`).order('updated_at').limit(3));
    await Promise.all(candidates.map(row => processIntake(db, row)));
    return res.status(200).json({ processed: candidates.length });
  } catch { return res.status(503).json({ error: 'Genesis queue could not be processed.' }); }
}
