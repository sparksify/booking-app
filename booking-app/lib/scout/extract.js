import { normalizeDomain } from './normalize';
export async function extractCandidates(results,mission) {
  if (process.env.ANTHROPIC_API_KEY) {
    const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.SCOUT_EXTRACTOR_MODEL||'claude-3-5-haiku-latest',max_tokens:1200,messages:[{role:'user',content:`Extract independent BUSINESS companies from these search results. Never output publishers, people, list titles, national chains, or an ungrounded company. For movers/shakers resolve the person's company. Return ONLY a JSON array with business_name, website (only if evidenced), source_url, source_title, source_snippet, signal_type. Max 8.\nMission: ${JSON.stringify({city:mission.city,vertical:mission.vertical,strategy:mission.strategy})}\nResults: ${JSON.stringify(results.map(r=>({title:r.title,url:r.url,snippet:r.snippet})))}`}]})});
    if (response.ok) { const d=await response.json(); try { const rows=JSON.parse(d.content?.[0]?.text?.replace(/```json|```/g,'').trim()); if(Array.isArray(rows)) return rows.filter(x=>x.business_name&&x.source_url); } catch {} }
  }
  return results.filter(r=>r.title&&r.url&&normalizeDomain(r.url)).slice(0,5).map(r=>({business_name:r.title.split(/[|–—-]/)[0].trim(),website:null,source_url:r.url,source_title:r.title,source_snippet:r.snippet,signal_type:mission.strategy.toLowerCase()}));
}
