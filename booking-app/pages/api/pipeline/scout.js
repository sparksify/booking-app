export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{
          name: 'submit_businesses',
          description: 'Submit the scored list of franchise-ready businesses.',
          input_schema: {
            type: 'object',
            properties: {
              businesses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    business_name:       { type: 'string' },
                    owner_name:          { type: 'string' },
                    website:             { type: 'string' },
                    domain:              { type: 'string' },
                    years_in_business:   { type: 'number' },
                    num_locations:       { type: 'number' },
                    franchise_score:     { type: 'number' },
                    ownership_score:     { type: 'number' },
                    total_score:         { type: 'number' },
                    signals:             { type: 'array', items: { type: 'string' } },
                    disqualified:        { type: 'boolean' },
                    disqualify_reason:   { type: 'string' },
                  },
                  required: ['business_name','franchise_score','ownership_score','total_score','signals','disqualified'],
                }
              }
            },
            required: ['businesses'],
          }
        }],
        tool_choice: { type: 'tool', name: 'submit_businesses' },
        messages: [{ role: 'user', content: `Find 15-20 real independent locally-owned ${industry} businesses in ${city} that are NOT franchises and NOT corporate chains. Must be at least 1 year old with at least one operating location.

For owner_name: real first and last name only. Never use "Local Owner" or any placeholder. Set null if unknown.

Score each:
franchise_score (0-10): +3 multiple city locations, +2 4+ years, +2 200+ high reviews, +2 systemized team, +1 press, +1 social, +1 hiring
ownership_score (0-10): +3 unique concept no national competitor, +2 strong brand, +2 scalable low build-out, +2 owner at growth ceiling, +1 hot category. BONUS: +2 if under 3 years old with strong buzz (emerging brand)
total_score = franchise_score + ownership_score

DISQUALIFY only if: already franchising with FDD filed, corporate parent, or 8+ locations across multiple states. Do NOT disqualify for being new or young.

Call submit_businesses now.` }],
      }),
    });

    if (!scoreRes.ok) {
      const err = await scoreRes.text();
      return res.status(500).json({ error: 'Claude error', detail: err });
    }

    const data = await scoreRes.json();
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_businesses');
    if (!toolUse) return res.status(500).json({ error: 'No structured response', stop_reason: data.stop_reason });

    const GENERIC = ['local owner','business owner','owner','local ownership','local ownership group','family','the owner','unknown','n/a','management','staff','team'];

    let businesses = (toolUse.input?.businesses || [])
      .filter(b => !b.disqualified)
      .map(b => {
        const yearsOld = b.years_in_business || 5;
        const isEmerging = yearsOld < 3 && (b.ownership_score || 0) >= 6;
        const isOwnership = (b.ownership_score || 0) >= 6;
        const isBroker = (b.franchise_score || 0) >= 6 && (b.total_score || 0) >= 12;
        const isEstablished = yearsOld >= 5 && (b.num_locations || 1) >= 2;
        return {
          ...b,
          city,
          industry,
          owner_name: b.owner_name && !GENERIC.some(g => b.owner_name.toLowerCase().includes(g)) ? b.owner_name : null,
          is_emerging: isEmerging,
          ownership_candidate: isOwnership,
          broker_candidate: isBroker,
          established: isEstablished,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
      });

    // Emerging first, then by total_score
    businesses.sort((a, b) => {
      if (a.is_emerging && !b.is_emerging) return -1;
      if (!a.is_emerging && b.is_emerging) return 1;
      return (b.total_score || 0) - (a.total_score || 0);
    });

    return res.status(200).json({
      city, industry,
      count: businesses.length,
      emerging_count: businesses.filter(b => b.is_emerging).length,
      ownership_candidates: businesses.filter(b => b.ownership_candidate).length,
      broker_candidates: businesses.filter(b => b.broker_candidate).length,
      businesses,
      run_at: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
