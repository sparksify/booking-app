import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { resultData, syncMailbox } from '@/lib/fccServer';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const expected=Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), provided=Buffer.from(req.headers.authorization || '');
  if(req.method!=='GET' || !process.env.CRON_SECRET || expected.length!==provided.length || !crypto.timingSafeEqual(expected,provided)) return res.status(401).json({error:'Unauthorized'});
  if(process.env.VERCEL_ENV!=='production') return res.status(403).json({error:'Production only'});
  try {
    const db=getSupabaseAdmin();
    const boxes=resultData(await db.from('fcc_mailboxes').select('*').eq('enabled',true).not('activation_at','is',null).order('updated_at').limit(1));
    const results=[];
    for(const box of boxes) results.push(await syncMailbox(db,box));
    res.status(results.some(r=>r.ok===false)?503:200).json({processed:results.length,ok:results.every(r=>r.ok!==false)});
  } catch {res.status(503).json({error:'FCC synchronization unavailable'});}
}
