export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    const res2 = await fetch('https://api.anthropic.com/v1/messages', {
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
                    owner_name:        { type: 'string', description: 'Real first and last name only. E.g. Randy Hays, Sarah Chen. Never use Local Owner, Business Owner, or any group placeholder. Null if genuinely unknown.' },
                    website:           { type: 'string' },
                    domain:            { type: 'string' },
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
        messages: [{ role: 'user', content: `List 8 real independent locally-owned ${industry} businesses in ${city} that are NOT franchises. Use your training knowledge — think carefully about actual businesses you know of in this city.

For owner_name: dig into your training data for the actual founder or owner first and last name. Examples of good answers: "Randy Hays" for Hays Cooling in Phoenix, "Justin Fourton" for Pecan Lodge in Dallas. Only put a real name you are confident about — set null if uncertain. Never use "Local Owner", "Business Owner", "Family", or any group name.

Also provide the real website domain for each business.

Scoring:
- franchise_score (0-10): +3 multiple city locations, +2 4+ years, +2 200+ high reviews, +2 systemized team, +1 press, +1 social, +1 hiring
- ownership_score (0-10): +3 unique no national competitor, +2 strong brand, +2 scalable low build-out, +2 owner at growth ceiling, +1 hot category
- total_score = franchise_score + ownership_score
- disqualify if: already franchising, FDD mention, corporate parent, 8+ locations across states

Call submit_businesses now.` }],
      }),
    });

    if (!res2.ok) {
      const err = await res2.text();
      return res.status(500).json({ error: 'Claude error', detail: err });
    }

    const data = await res2.json();
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_businesses');
    if (!toolUse) return res.status(500).json({ error: 'No structured response', stop_reason: data.stop_reason });

    const GENERIC = ['local owner','business owner','owner','local ownership','local ownership group','family','the owner','unknown','n/a','management','staff','team'];

    const businesses = (toolUse.input?.businesses || [])
      .filter(b => !b.disqualified)
      .map(b => ({
        ...b,
        city,
        industry,
        owner_name: b.owner_name && !GENERIC.some(g => b.owner_name.toLowerCase().includes(g)) ? b.owner_name : null,
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
