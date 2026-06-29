export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    // Step 1: Research pass — Claude thinks hard about real businesses and owners
    const researchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `I need the actual first and last names of real business owners for independent ${industry} companies in ${city}.

Think carefully through your training data. For each business you know of in this city and industry, recall:
- The business name
- The REAL owner or founder's first and last name (not "Local Owner" or "the owner" — actual names like "Randy Hays" or "Mike Chen")
- Their website domain
- How long they have been in business
- Number of locations

Only include businesses where you actually know or can confidently recall the owner's real name. If you only know the business name but not who owns it, skip it. I would rather have 4 businesses with real owner names than 8 with fake placeholders.

List them in plain text, one per line.` }],
      }),
    });

    let researchText = '';
    if (researchRes.ok) {
      const d = await researchRes.json();
      researchText = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    }

    // Step 2: Score into structured format
    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        tools: [{
          name: 'submit_businesses',
          description: 'Submit the scored list of franchise-ready businesses with real owner names.',
          input_schema: {
            type: 'object',
            properties: {
              businesses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    business_name:     { type: 'string' },
                    owner_name:        { type: 'string', description: 'The real first and last name of the owner. Examples: Randy Hays, Mike Rodriguez, Sarah Chen. NEVER use Local Owner, Business Owner, Local Ownership Group, or any placeholder. Set to null if genuinely unknown.' },
                    website:           { type: 'string' },
                    domain:            { type: 'string', description: 'The website domain without www, e.g. hayscooling.com' },
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
        messages: [{ role: 'user', content: `Using this research about ${industry} businesses in ${city}, score each one.

Research:
${researchText}

Scoring:
- franchise_score (0-10): +3 multiple city locations, +2 4+ years, +2 200+ high reviews, +2 systemized team, +1 press, +1 social, +1 hiring
- ownership_score (0-10): +3 unique no national competitor, +2 strong brand, +2 scalable low build-out, +2 owner at growth ceiling, +1 hot category
- total_score = franchise_score + ownership_score
- disqualify if: already franchising, FDD mention, corporate parent, 8+ locations across states

IMPORTANT: Only include businesses where owner_name is a real person's first and last name. Do not submit any business with a placeholder owner name like "Local Owner" or "Local Ownership Group" — set owner_name to null for those and still include the business.

Call submit_businesses now.` }],
      }),
    });

    if (!scoreRes.ok) {
      const err = await scoreRes.text();
      return res.status(500).json({ error: 'Claude error', detail: err });
    }

    const scoreData = await scoreRes.json();
    const toolUse = (scoreData.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_businesses');
    if (!toolUse) return res.status(500).json({ error: 'No structured response' });

    const GENERIC_NAMES = ['local owner','business owner','owner','local ownership','local ownership group','family','the owner','unknown','n/a'];

    const businesses = (toolUse.input?.businesses || [])
      .filter(b => !b.disqualified)
      .map(b => ({
        ...b,
        city,
        industry,
        owner_name: b.owner_name && !GENERIC_NAMES.includes(b.owner_name.toLowerCase().trim()) ? b.owner_name : null,
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
