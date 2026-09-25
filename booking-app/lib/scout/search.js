function normalizeResult(item) { return { title:item.title||'', url:item.link||item.url||'', snippet:item.snippet||'', position:item.position||null, raw:item }; }
async function serpApi(query,{limit=10}={}) {
  if (!process.env.SERP_API_KEY) throw new Error('Missing SERP_API_KEY');
  const p=new URLSearchParams({engine:'google',q:query,num:String(limit),api_key:process.env.SERP_API_KEY});
  const response=await fetch(`https://serpapi.com/search.json?${p}`);
  if (!response.ok) throw new Error(`SerpAPI search failed (${response.status})`);
  const json=await response.json();
  if (json.error) throw new Error(json.error);
  return (json.organic_results||[]).slice(0,limit).map(normalizeResult);
}
const providers={serpapi:serpApi};
export async function searchWeb(query,options={}) {
  const provider=options.provider||process.env.SCOUT_SEARCH_PROVIDER||'serpapi';
  if (!providers[provider]) throw new Error(`Unsupported Scout search provider: ${provider}`);
  return providers[provider](query,options);
}
