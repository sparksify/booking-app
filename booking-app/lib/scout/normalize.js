const publisherHosts=new Set(['facebook.com','instagram.com','linkedin.com','youtube.com','yelp.com','tripadvisor.com']);
export function normalizeDomain(value) { try { const h=new URL(value.startsWith('http')?value:`https://${value}`).hostname.toLowerCase().replace(/^www\./,''); return publisherHosts.has(h)?null:h; } catch { return null; } }
export function normalizeName(value='') { return value.toLowerCase().replace(/&/g,' and ').replace(/\b(llc|inc|co|company|restaurant|official)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
export function normalizeCandidate(input,mission) {
  const website=input.website||input.url||null, domain=normalizeDomain(input.domain||website||'');
  return {business_name:String(input.business_name||'').trim(),normalized_name:normalizeName(input.business_name),website:domain?website:null,domain,
    city:input.city||mission.city,state:input.state||mission.state,metro:mission.metro,industry:input.industry||mission.vertical,
    primary_strategy:mission.strategy,primary_mission_id:mission.id};
}
export function scoutCandidateToGenesisBusiness(c) { return {business_name:c.business_name,city:[c.city,c.state].filter(Boolean).join(', '),industry:c.industry,website:c.website,domain:c.domain,owner_name:null,signals:Array.isArray(c.qualification_reasons)?c.qualification_reasons:[],franchise_score:c.qualification_score||0,ownership_score:0,total_score:c.qualification_score||0,ownership_candidate:false}; }
