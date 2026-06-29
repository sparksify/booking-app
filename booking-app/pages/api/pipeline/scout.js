export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    // Step 1: Web search research — find real businesses with real owner names
    const researchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Search the web for independent locally-owned ${industry} businesses in ${city} that are NOT franchises. 

Search for:
1. "best independent ${industry.toLowerCase()} ${city} owner"
2. "top rated local ${industry.toLowerCase()} ${city} founded by"
3. "${city} ${industry.toLowerCase()} small business owner"

For each business you find I need:
- Business name
- Owner first and last name (real person, not a company name)
- Website URL
- How long in business
- Number of locations
- Any awards or press mentions

Only include businesses where you can find the actual owner's real first and last name. Skip any where only a generic contact or company name is available. I need at least 6-8 businesses with real named owners.` }],
      }),
    });

    let researchText = '';
    if (researchRes.ok) {
      const d = await researchRes.json();
      researchText = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').slice(0, 3000);
    }

    // Step 2: Score into structured format using tool_use
    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        tools: [{
          name: 'submit_businesses',
          description: 'Submit the final scored list of franchise-ready businesses.',
          input_schema: {
            type: 'object',
            properties: {
              businesses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    business_name:     { type: 'string' },
                    owner_name:        { type: 'string', description: 'Real first and last name of owner. E.g. Randy Hays, Mike Rodriguez. NEVER use Local Owner, Business Owner, Family, Group, or any placeholder. Set null if genuinely unknown.' },
                    website:           { type: 'string' },
                    domain:            { type: 'string', description: 'Domain without www. E.g. hayscooling.com' },
                    franchise_score:   { type: 'number' },
                    ownership_score:   { type: 'number' },
                    total_score:       { type: 'number' },
                    signals:           { type: 'array', items: { type: 'string' } },
                    disqualified:      { type: 'boolean' },
                    disqualify_reason: { type: 'string' },
                  },
                  required: ['business_name','franchise_score','ownership_score','total_score','signals','disqualified'],
                }
              }
            },
            required: ['businesses'],
          }
        }],
        tool_choice: { type: 'tool', name: 'submit_businesses' },
        messages: [{ role: 'user', content: `Score these ${industry} businesses in ${city} based on this research.

Research:
${researchText || `Use your training knowledge to list 8 real independent ${industry} businesses in ${city} with real owner names.`}

Scoring:
- franchise_score (0-10): +3 multiple city locations, +2 4+ years in business, +2 200+ high reviews, +2 systemized team roles, +1 local press or awards, +1 active social media, +1 detailed hiring posts
- ownership_score (0-10): +3 unique concept no national franchise competitor, +2 strong recognizable brand, +2 scalable low build-out model, +2 owner appears at growth ceiling, +1 hot franchise category right now
- total_score = franchise_score + ownership_score
- DISQUALIFY if: already franchising, FDD mention, corporate parent, 8+ locations across multiple states

CRITICAL: owner_name must be a real person's first and last name found in the research. Never submit a placeholder. If the research did not find a real owner name for a business, set owner_name to null — do not invent a name.

Call submit_businesses now.` }],
      }),
    });

    if (!scoreRes.ok) {
      const err = await scoreRes.text();
      return res.status(500).json({ error: 'Claude error', detail: err });
    }

    const scoreData = await scoreRes.json();
    const toolUse = (scoreData.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_businesses');
    if (!toolUse) return res.status(500).json({ error: 'No structured response', stop_reason: scoreData.stop_reason });

    const GENERIC_NAMES = ['local owner','business owner','owner','local ownership','local ownership group','family','the owner','unknown','n/a','management','staff','team'];

    const businesses = (toolUse.input?.businesses || [])
      .filter(b => !b.disqualified)
      .map(b => ({
        ...b,
        city,
        industry,
        owner_name: b.owner_name && !GENERIC_NAMES.some(g => b.owner_name.toLowerCase().includes(g)) ? b.owner_name : null,
        ownership_candidate: (b.ownership_score || 0) >= 6,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }))
      .sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

    return res.status(200).json({
      city, industry,
      count: businesses.length,
      ownership_candidates: businesses.filter(b => b.ownership_candidate).length,
      businesses,
      run_at: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
