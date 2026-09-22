import { SCOUT_MARKETS, SCOUT_STRATEGIES, SCOUT_VERTICALS } from './catalog';
import { buildMissionQuery, nextMissionDelayDays } from './strategies';
import { searchWeb } from './search';
import { extractCandidates } from './extract';
import { normalizeCandidate, scoutCandidateToGenesisBusiness } from './normalize';
import { qualifyScoutCandidate } from './qualify';
import { invokeHandler } from './invokeHandler';
import filterHandler from '@/pages/api/pipeline/filter';
import discoverHandler from '@/pages/api/pipeline/discover';
import enrichHandler from '@/pages/api/pipeline/enrich';
import outreachHandler from '@/pages/api/pipeline/outreach';

const DAY=86400000;
const event=(db,event_type,message,extra={})=>db.from('scout_events').insert({event_type,message,...extra});
const usageCount=async(db,kind,since)=>{const {count,error}=await db.from('scout_usage').select('*',{count:'exact',head:true}).eq('kind',kind).gte('created_at',since);if(error)throw error;return count||0;};

export async function seedMissions(db) {
  const {count}=await db.from('scout_missions').select('*',{count:'exact',head:true}); if(count) return 0;
  const rows=[]; for(const market of SCOUT_MARKETS) for(const vertical of SCOUT_VERTICALS) for(const strategy of SCOUT_STRATEGIES) rows.push({...market,vertical,strategy,priority:strategy==='EXPANSION'?3:strategy==='MULTI_LOCATION'?2.5:strategy==='BEST_OF'?2:1});
  const {error}=await db.from('scout_missions').upsert(rows,{onConflict:'metro,vertical,strategy'}); if(error)throw error; return rows.length;
}

async function findExisting(db,c) {
  if(c.domain){const {data}=await db.from('scout_candidates').select('*').ilike('domain',c.domain).maybeSingle();if(data)return data;}
  const {data}=await db.from('scout_candidates').select('*').eq('normalized_name',c.normalized_name).eq('metro',c.metro).limit(1); if(data?.[0])return data[0];
  let q=db.from('pipeline_prospects').select('id,business_name,domain,city').limit(20);
  q=c.domain?q.ilike('domain',c.domain):q.ilike('business_name',c.business_name);
  const {data:prospects}=await q; return prospects?.length?{pipelineDuplicate:prospects[0]}:null;
}
async function storeDiscovery(db,item,mission) {
  const c=normalizeCandidate(item,mission); if(!c.business_name||c.normalized_name.length<2)return {ignored:true};
  const existing=await findExisting(db,c); let candidate=existing&&!existing.pipelineDuplicate?existing:null;
  if(existing?.pipelineDuplicate){
    const {data,error}=await db.from('scout_candidates').insert({...c,qualification_status:'DUPLICATE',genesis_status:'ALREADY_PROCESSED',rejection_reason:'Already exists in Genesis',pipeline_prospect_id:existing.pipelineDuplicate.id}).select().single();if(error)throw error;candidate=data;
  } else if(candidate) await db.from('scout_candidates').update({last_discovered_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',candidate.id);
  else {const {data,error}=await db.from('scout_candidates').insert(c).select().single();if(error)throw error;candidate=data;}
  const source={candidate_id:candidate.id,mission_id:mission.id,strategy:mission.strategy,source_url:item.source_url,source_domain:(()=>{try{return new URL(item.source_url).hostname.replace(/^www\./,'');}catch{return null;}})(),source_title:item.source_title,source_snippet:item.source_snippet,signal_type:item.signal_type||mission.strategy.toLowerCase(),raw_payload:item};
  const {error:sourceError}=await db.from('scout_candidate_sources').upsert(source,{onConflict:'candidate_id,source_url',ignoreDuplicates:true}); if(sourceError)throw sourceError;
  const duplicate=!!existing; await event(db,duplicate?'duplicate_suppressed':'candidate_discovered',duplicate?`Candidate already exists — evidence merged for ${candidate.business_name}`:`${mission.strategy.replace('_',' ')} Scout found ${candidate.business_name} in ${mission.city}`,{candidate_id:candidate.id,mission_id:mission.id,metadata:{source_url:item.source_url}});
  return {candidate,duplicate,isNew:!existing};
}
async function qualify(db,candidate,settings) {
  const {data:evidence}=await db.from('scout_candidate_sources').select('*').eq('candidate_id',candidate.id);
  await db.from('scout_candidates').update({qualification_status:'QUALIFYING'}).eq('id',candidate.id);
  const result=await qualifyScoutCandidate(candidate,evidence||[]); const status=result.decision==='qualified'&&result.score>=settings.minimum_qualification_score?'QUALIFIED':result.decision==='uncertain'?'UNCERTAIN':'REJECTED';
  await db.from('scout_candidates').update({qualification_status:status,qualification_score:result.score,qualification_reasons:result.reasons||[],signals:result.signals||{},rejection_reason:status==='REJECTED'?(result.reasons||[]).join('; '):null,genesis_status:status==='QUALIFIED'?'QUEUED':'NOT_QUEUED',updated_at:new Date().toISOString()}).eq('id',candidate.id);
  await db.from('scout_usage').insert({kind:'classification',provider:process.env.SCOUT_CLASSIFIER_PROVIDER||'heuristic',candidate_id:candidate.id,mission_id:candidate.primary_mission_id});
  await event(db,status==='QUALIFIED'?'candidate_qualified':'candidate_rejected',`${candidate.business_name}: qualification score ${result.score} — ${status.toLowerCase()}`,{candidate_id:candidate.id,mission_id:candidate.primary_mission_id,metadata:result}); return status;
}
async function executeMission(db,mission,settings) {
  const query=buildMissionQuery(mission); await event(db,'mission_started',`Searching ${mission.city} ${mission.vertical}: ${query}`,{mission_id:mission.id,metadata:{query,provider:mission.provider}});
  try {
    const results=await searchWeb(query,{provider:mission.provider,limit:10}); await db.from('scout_usage').insert({kind:'search',provider:mission.provider,mission_id:mission.id});
    const extracted=await extractCandidates(results,mission); let found=0,qualified=0,duplicates=0;
    for(const item of extracted){const saved=await storeDiscovery(db,item,mission);if(saved.ignored)continue;found++;duplicates+=saved.duplicate?1:0;if(saved.isNew){const today=new Date(Date.now()-DAY).toISOString();if(await usageCount(db,'classification',today)<settings.classifications_per_day_limit){if(await qualify(db,saved.candidate,settings)==='QUALIFIED')qualified++;}}}
    const delay=nextMissionDelayDays(mission,found),base=mission.strategy==='EXPANSION'?3:mission.strategy==='MULTI_LOCATION'?2.5:mission.strategy==='BEST_OF'?2:1,yieldBoost=Math.min(2,qualified*.5+found*.1); await db.from('scout_missions').update({status:'READY',priority:base+yieldBoost,query,query_variant:(mission.query_variant||0)+1,last_run_at:new Date().toISOString(),next_run_at:new Date(Date.now()+delay*DAY).toISOString(),run_count:mission.run_count+1,search_results_count:mission.search_results_count+results.length,candidates_found:mission.candidates_found+found,candidates_qualified:mission.candidates_qualified+qualified,duplicates_found:mission.duplicates_found+duplicates,consecutive_errors:0,last_error:null,claimed_at:null,updated_at:new Date().toISOString()}).eq('id',mission.id);
    await event(db,'search_completed',`${query}: ${results.length} results, ${found} candidates`,{mission_id:mission.id,metadata:{query,results:results.length,found,qualified,duplicates}}); return {found,qualified,duplicates};
  } catch(error){const failures=(mission.consecutive_errors||0)+1,delay=failures>=5?14:failures>=3?7:1;await db.from('scout_missions').update({status:failures>=5?'DEGRADED':'READY',consecutive_errors:failures,last_error:error.message,claimed_at:null,next_run_at:new Date(Date.now()+delay*DAY).toISOString(),updated_at:new Date().toISOString()}).eq('id',mission.id);await event(db,'error',`Mission failed: ${error.message}`,{mission_id:mission.id,metadata:{failures}});return {error:error.message};}
}
async function genesisHandoff(db,candidate,outreachEnabled) {
  await db.from('scout_candidates').update({genesis_status:'DISCOVERING'}).eq('id',candidate.id);
  try {
    const business=scoutCandidateToGenesisBusiness(candidate); const filtered=await invokeHandler(filterHandler,{businesses:[business]});
    if(!filtered.businesses?.length){await db.from('scout_candidates').update({qualification_status:'REJECTED',genesis_status:'REJECTED_EXISTING_FRANCHISE',rejection_reason:'Existing franchise detected',processed_at:new Date().toISOString()}).eq('id',candidate.id);await event(db,'candidate_rejected',`${candidate.business_name}: existing franchise detected`,{candidate_id:candidate.id});return;}
    const discovered=await invokeHandler(discoverHandler,{businesses:filtered.businesses}); await db.from('scout_candidates').update({genesis_status:'ENRICHING'}).eq('id',candidate.id); await event(db,'genesis_owner_found',discovered.businesses[0]?.owner_name?`Owner identified for ${candidate.business_name}: ${discovered.businesses[0].owner_name}`:`No owner found for ${candidate.business_name}`,{candidate_id:candidate.id});
    const enriched=await invokeHandler(enrichHandler,{businesses:discovered.businesses}); const prospect=enriched.results[0]; let outreach=null;
    if(outreachEnabled&&prospect?.loadable&&prospect.email) outreach=await invokeHandler(outreachHandler,{businesses:[prospect]});
    const out=outreach?.results?.[0]; const {data:run,error:runErr}=await db.from('pipeline_runs').insert({city:candidate.city||'Scout',industry:candidate.industry||'Unknown',found:1,enriched_count:prospect?.enriched?1:0,enrichment_rate:prospect?.enriched?100:0,loaded:out?.outreach_status==='loaded'?1:0,ownership_candidates:0}).select().single();if(runErr)throw runErr;
    const source=(await db.from('scout_candidate_sources').select('source_url').eq('candidate_id',candidate.id).limit(1)).data?.[0];
    const {data:saved,error:saveErr}=await db.from('pipeline_prospects').insert({run_id:run.id,business_name:candidate.business_name,city:candidate.city,industry:candidate.industry,owner_name:prospect?.owner_name||prospect?.email_owner,email:prospect?.email?.toLowerCase()||null,domain:candidate.domain,website:candidate.website,email_source:prospect?.email_source,verification:prospect?.verification,phone:prospect?.phone,franchise_score:candidate.qualification_score||0,total_score:candidate.qualification_score||0,signals:candidate.qualification_reasons||[],enriched:!!prospect?.enriched,loaded:out?.outreach_status==='loaded',smartlead_status:outreachEnabled?(out?.outreach_status||'not_loadable'):'discovery_only',source_type:'scout',scout_candidate_id:candidate.id,scout_strategy:candidate.primary_strategy,scout_mission_id:candidate.primary_mission_id,scout_score:candidate.qualification_score,scout_source_url:source?.source_url}).select().single();if(saveErr)throw saveErr;
    const status=out?.outreach_status==='loaded'?'SMARTLEAD_LOADED':prospect?.enriched?'ENRICHED':discovered.businesses[0]?.owner_name?'OWNER_FOUND':'RESEARCHED';await db.from('scout_candidates').update({genesis_status:status,pipeline_prospect_id:saved.id,processed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',candidate.id);await db.from('scout_usage').insert({kind:'genesis',candidate_id:candidate.id,mission_id:candidate.primary_mission_id});await event(db,'sent_to_genesis',`${candidate.business_name} sent to Genesis (${outreachEnabled?'live outreach':'discovery only'})`,{candidate_id:candidate.id,metadata:{status,email_found:!!prospect?.email}});if(out?.outreach_status==='loaded')await event(db,'smartlead_loaded',`${candidate.business_name} loaded into Smartlead`,{candidate_id:candidate.id});
  } catch(error){await db.from('scout_candidates').update({genesis_status:'FAILED_RETRYABLE',last_error:error.message,retry_count:(candidate.retry_count||0)+1,updated_at:new Date().toISOString()}).eq('id',candidate.id);await event(db,'error',`Genesis handoff failed for ${candidate.business_name}: ${error.message}`,{candidate_id:candidate.id});}
}
export async function runScoutTick(db) {
  const {data:settings,error}=await db.from('scout_settings').select('*').eq('id',true).single();if(error)throw error;if(!settings.enabled)return {skipped:'paused'};
  await seedMissions(db); const now=Date.now(),hour=new Date(now-3600000).toISOString(),day=new Date(now-DAY).toISOString(); const hourly=await usageCount(db,'search',hour),daily=await usageCount(db,'search',day); const capacity=Math.max(0,Math.min(2,settings.searches_per_hour_limit-hourly,settings.searches_per_day_limit-daily));let missions=[];
  if(capacity){const claimed=await db.rpc('claim_scout_missions',{claim_limit:capacity});if(claimed.error)throw claimed.error;missions=claimed.data||[];} const missionResults=[];for(const mission of missions)missionResults.push(await executeMission(db,mission,settings));
  const genesisUsed=await usageCount(db,'genesis',day),genesisCapacity=Math.max(0,Math.min(2,settings.genesis_per_day_limit-genesisUsed));const {data:queue}=await db.from('scout_candidates').select('*').eq('qualification_status','QUALIFIED').in('genesis_status',['QUEUED','FAILED_RETRYABLE']).order('qualification_score',{ascending:false}).limit(genesisCapacity);const outreachEnabled=process.env.SCOUT_OUTREACH_ENABLED==='true';for(const candidate of queue||[])await genesisHandoff(db,candidate,outreachEnabled);
  await db.from('scout_settings').update({last_tick_at:new Date().toISOString(),status:'RUNNING',last_error:null,updated_at:new Date().toISOString()}).eq('id',true);return {missions:missions.length,missionResults,genesis:(queue||[]).length,outreachEnabled};
}
