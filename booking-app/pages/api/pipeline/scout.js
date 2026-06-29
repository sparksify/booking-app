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
                    concept_score:       { type: 'number' },
                    owner_score:         { type: 'number' },
                    market_score:        { type: 'number' },
                    traction_score:      { type: 'number' },
                    total_score:         { type: 'number' },
                    signals:             { type: 'array', items: { type: 'string' } },
                    is_emerging:         { type: 'boolean' },
                    ownership_candidate: { type: 'boolean' },
                    broker_candidate:    { type: 'boolean' },
                    established:         { type: 'boolean' },
                    disqualified:        { type: 'boolean' },
                    disqualify_reason:   { type: 'string' },
                  },
                  required: ['business_name','concept_score','owner_score','market_score','traction_score','total_score','signals','disqualified'],
                }
              }
            },
            required: ['businesses'],
          }
        }],
        tool_choice: { type: 'tool', name: 'submit_businesses' },
        messages: [{ role: 'user', content: `Find 15-20 real independent locally-owned ${industry} businesses in ${city} that are NOT franchises. Must be at least 1 year old.

For owner_name: provide real first and last name only if you know it. Never use "Local Owner" or placeholder names.

Score each using:

CONCEPT SCORE (0-15):
+5 Unique concept, no direct national franchise competitor
+3 Press coverage in city/regional media
+3 Strong brand, cult following, notable social presence
+2 Favorable unit economics (low build-out, high margin)
+2 Demand signals: waitlists, sold-out, capacity constraints

OWNER SCORE (0-10):
+3 Owner public-facing, named in press or social
+3 Owner expressed growth or expansion interest
+2 Owner early to mid career
+2 Prior entrepreneurship or business background

MARKET SCORE (0-10):
+4 Category trending in franchise buyer demand
+3 City underserved in this concept
+3 Demand exceeding capacity

TRACTION SCORE (0-5):
+2 High review velocity
+2 Awards or editorial recognition
+1 Repeat press coverage

total_score = concept_score + owner_score + market_score + traction_score

FLAGS (set based on scores):
is_emerging = years_in_business < 3 AND concept_score >= 8
ownership_candidate = concept_score >= 10 AND owner_score >= 6
broker_candidate = concept_score >= 8 AND total_score >= 18
established = years_in_business >= 5 AND num_locations >= 2

DISQUALIFY only if: already actively franchising with FDD, corporate parent, or 8+ locations across multiple states. Do NOT disqualify for being new or young.

Call submit_businesses now with all businesses scored.` }],
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
      .map(b => ({
        ...b,
        city,
        industry,
        owner_name: b.owner_name && !GENERIC.some(g => b.owner_name.toLowerCase().includes(g)) ? b.owner_name : null,
        is_emerging: b.is_emerging || false,
        ownership_candidate: b.ownership_candidate || false,
        broker_candidate: b.broker_candidate || false,
        established: b.established || false,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }));

    // Emerging brands first, then by total_score
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
