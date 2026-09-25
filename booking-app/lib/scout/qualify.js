function heuristic(candidate,evidence) {
  const text=evidence.map(e=>`${e.source_title} ${e.source_snippet}`).join(' ').toLowerCase();
  const signals={multi_location:/second|third|multiple|locations|regional/.test(text),expansion:/expand|new location|opening/.test(text),award:/award|winner|best of|readers.? choice/.test(text),strong_brand:/cult favorite|popular|favorite|lines out/.test(text)};
  let score=35+Object.values(signals).filter(Boolean).length*15+Math.min(10,evidence.length*3);
  if (/franchise opportunity|franchisee|national chain|public company|closed permanently/.test(text)) score=10;
  const reasons=Object.entries(signals).filter(([,v])=>v).map(([k])=>k.replace('_',' '));
  return {decision:score>=65?'qualified':score>=50?'uncertain':'rejected',score:Math.min(100,score),reasons:reasons.length?reasons:['insufficient public growth evidence'],signals};
}
export async function qualifyScoutCandidate(candidate,evidence) {
  const provider=process.env.SCOUT_CLASSIFIER_PROVIDER||'heuristic';
  if (provider==='heuristic'||!process.env.ANTHROPIC_API_KEY) return heuristic(candidate,evidence);
  const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.SCOUT_CLASSIFIER_MODEL||'claude-3-5-haiku-latest',max_tokens:450,messages:[{role:'user',content:`Classify this company as a potential independent, repeatable franchise brand. Reject existing franchises, national/public chains, closed businesses, hobby operations, generic practices, and insufficient evidence. Return ONLY JSON: {"decision":"qualified|rejected|uncertain","score":0-100,"reasons":["..."],"signals":{"multi_location":boolean,"expansion":boolean,"award":boolean,"strong_brand":boolean}}\nCompany: ${JSON.stringify(candidate)}\nEvidence: ${JSON.stringify(evidence.map(e=>({title:e.source_title,snippet:e.source_snippet,url:e.source_url})))}`}]})});
  if (!response.ok) throw new Error(`Classifier failed (${response.status})`);
  const data=await response.json(); const raw=data.content?.[0]?.text?.replace(/```json|```/g,'').trim();
  try { return JSON.parse(raw); } catch { return heuristic(candidate,evidence); }
}
