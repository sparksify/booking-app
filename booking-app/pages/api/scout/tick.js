export const config={maxDuration:300};
import { getSupabaseAdmin } from '@/lib/supabase';
import { validCron } from '@/lib/scout/auth';
import { runScoutTick } from '@/lib/scout/orchestrator';
export default async function handler(req,res){if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed'});if(!validCron(req))return res.status(401).json({error:'Unauthorized'});try{return res.json(await runScoutTick(getSupabaseAdmin()));}catch(error){const db=getSupabaseAdmin();await db.from('scout_settings').update({status:'ERROR',last_error:error.message,updated_at:new Date().toISOString()}).eq('id',true);await db.from('scout_events').insert({event_type:'error',message:`Scout tick failed: ${error.message}`});return res.status(500).json({error:error.message});}}
