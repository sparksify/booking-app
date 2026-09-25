import { getSupabaseAdmin } from '@/lib/supabase';
import { requireScoutUser } from '@/lib/scout/auth';
import { seedMissions } from '@/lib/scout/orchestrator';

export default async function handler(req,res){
  if(!['GET','POST','PATCH'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!await requireScoutUser(req,res))return;const db=getSupabaseAdmin();
  try{
    if(req.method==='POST'){
      const seeded=await seedMissions(db);const now=new Date().toISOString();const {error}=await db.from('scout_settings').update({enabled:true,status:'RUNNING',started_at:now,paused_at:null,last_error:null,updated_at:now}).eq('id',true);if(error)throw error;
      await db.from('scout_events').insert({event_type:'scout_started',message:'Scout started — autonomous discovery is active',metadata:{seeded_missions:seeded}});return res.json({ok:true,enabled:true,seeded});
    }
    if(req.method==='PATCH'){
      const now=new Date().toISOString();const {error}=await db.from('scout_settings').update({enabled:false,status:'PAUSED',paused_at:now,updated_at:now}).eq('id',true);if(error)throw error;await db.from('scout_events').insert({event_type:'scout_paused',message:'Scout paused — in-progress work may finish safely'});return res.json({ok:true,enabled:false});
    }
    const since=new Date();since.setUTCHours(0,0,0,0);const iso=since.toISOString();
    const [{data:settings,error:settingsError},{data:events},{data:candidates},{data:missions},{data:usage},{data:prospects}]=await Promise.all([
      db.from('scout_settings').select('*').eq('id',true).single(),db.from('scout_events').select('*').order('created_at',{ascending:false}).limit(60),
      db.from('scout_candidates').select('*,scout_candidate_sources(count)').order('first_discovered_at',{ascending:false}).limit(50),
      db.from('scout_missions').select('strategy,run_count,candidates_found,candidates_qualified,duplicates_found,status,last_run_at,next_run_at'),
      db.from('scout_usage').select('kind').gte('created_at',iso),db.from('pipeline_prospects').select('scout_candidate_id,owner_name,email,loaded').not('scout_candidate_id','is',null).gte('created_at',iso)
    ]);if(settingsError)throw settingsError;
    const allCandidates=candidates||[],todayCandidates=allCandidates.filter(c=>c.first_discovered_at>=iso);const strategyMap={};for(const m of missions||[]){const x=strategyMap[m.strategy]||={strategy:m.strategy,searches:0,candidates:0,qualified:0,duplicates:0};x.searches+=m.run_count;x.candidates+=m.candidates_found;x.qualified+=m.candidates_qualified;x.duplicates+=m.duplicates_found;}
    const metrics={searches_today:(usage||[]).filter(x=>x.kind==='search').length,raw_businesses_found:todayCandidates.length,unique_candidates:todayCandidates.filter(x=>x.qualification_status!=='DUPLICATE').length,qualified:todayCandidates.filter(x=>x.qualification_status==='QUALIFIED').length,rejected:todayCandidates.filter(x=>x.qualification_status==='REJECTED').length,duplicates_suppressed:(events||[]).filter(x=>x.event_type==='duplicate_suppressed'&&x.created_at>=iso).length,sent_to_genesis:(prospects||[]).length,owners_found:(prospects||[]).filter(x=>x.owner_name).length,emails_found:(prospects||[]).filter(x=>x.email).length,smartlead_loaded:(prospects||[]).filter(x=>x.loaded).length,errors:(events||[]).filter(x=>x.event_type==='error'&&x.created_at>=iso).length};
    return res.json({settings,outreach_enabled:process.env.SCOUT_OUTREACH_ENABLED==='true',metrics,events:events||[],candidates:allCandidates,strategies:Object.values(strategyMap)});
  }catch(error){return res.status(500).json({error:error.message});}
}
