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
                    business_name:     { type: 'string' },
                    owner_name:        { type: 'string', description: 'Real first and last name only. E.g. Randy Hays, Sarah Chen. Never use Local Owner or any placeholder. Null if genuinely unknown.' },
                    website:           { type: 'string' },
                    domain:            { type: 'string' },
                    years_in_business: { type: 'number', description: 'Approximate years in operation. Must be at least 1.' },
                    num_locations:     { type: 'number', description: 'Number of current locations.' },
                    concept_score:     { type: 'number', description: 'Score 0-15 based on uniqueness, press, brand strength, unit economics, demand signals.' },
                    owner_score:       { type: 'number', description: 'Score 0-10 based on owner visibility, growth ambition, career stage, background.' },
                    market_score:      { type: 'number', description: 'Score 0-10 based on category demand, city underserved, capacity signals.' },
                    traction_score:    { type: 'number', description: 'Score 0-5 based on review velocity, awards, press frequency.' },
                    total_score:       { type: 'number', description: 'Sum of all four scores.' },
                    signals:           { type: 'array', items: { type: 'string' }, description: 'Specific evidence found for this business.' },
                    is_emerging:       { type: 'boolean', description: 'True if under 3 years old AND concept_score >= 10. These are high-priority ownership candidates.' },
                    ownership_candidate: { type: 'boolean', description: 'True if concept_score >= 10 AND owner_score >= 6.' },
                    broker_candidate:  { type: 'boolean', description: 'True if concept_score >= 8 AND total_score >= 20.' },
                    established:       { type: 'boolean', description: 'True if 5+ years AND 2+ locations. Flag carefully - may have been approached before.' },
                    disqualified:      { type: 'boolean' },
                    disqualify_reason: { type: 'string' },
                  },
                  required: ['business_name','concept_score','owner_score','market_score','traction_score','total_score','signals','is_emerging','ownership_candidate','broker_candidate','established','disqualified'],
                }
              }
            },
            required: ['businesses'],
          }
        }],
        tool_choice: { type: 'tool', name: 'submit_businesses' },
        messages: [{ role: 'user', content: `Find 15-20 real independent locally-owned ${industry} businesses in ${city} that are NOT franchises and NOT corporate chains. Must be at least 1 year old with at least one operating location.

For each business provide the real owner first and last name if you know it. Never use "Local Owner" or placeholder names.

Score each business using this framework:

CONCEPT SCORE (0-15):
+5 Unique concept with no direct national franchise competitor
+3 Press coverage in city/regional media or industry blogs
+3 Strong visual brand, cult following, or notable social presence
+2 Favorable unit economics (low build-out cost, high margin category)
+2 Demand signals: waitlists, sold-out events, capacity constraints

OWNER SCORE (0-10):
+3 Owner is public-facing, visible, named in press or social media
+3 Owner has expressed growth interest or expansion ambition
+2 Owner appears early to mid career (not near retirement)
+2 Prior entrepreneurship or business background

MARKET SCORE (0-10):
+4 Category is trending in franchise buyer demand right now
+3 City is underserved in this specific concept or category
+3 Demonstrable demand exceeding current capacity

TRACTION SCORE (0-5):
+2 High review velocity (many reviews in short time period)
+2 Award nominations or editorial recognition
+1 Repeat press coverage across multiple outlets

FLAGS:
- is_emerging: true if under 3 years old AND concept_score >= 10
- ownership_candidate: true if concept_score >= 10 AND owner_score >= 6
- broker_candidate: true if concept_score >= 8 AND total_score >= 20
- established: true if 5+ years AND 2+ locations (flag carefully)

DISQUALIFY if: already franchising, FDD mention, corporate parent, 8+ locations across states, less than 1 year old.

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
      .map(b => ({
        ...b,
        city,
        industry,
        owner_name: b.owner_name && !GENERIC.some(g => b.owner_name.toLowerCase().includes(g)) ? b.owner_name : null,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }));

    // Sort: emerging first, then by total_score
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
