export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [
          { type: 'web_search_20250305', name: 'web_search' },
          {
            name: 'submit_businesses',
            description: 'Submit the final list of scored franchise-ready businesses. Call this tool once when done researching.',
            input_schema: {
              type: 'object',
              properties: {
                businesses: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      business_name:     { type: 'string' },
                      owner_name:        { type: 'string' },
                      website:           { type: 'string' },
                      domain:            { type: 'string' },
                      franchise_score:   { type: 'number' },
                      ownership_score:   { type: 'number' },
                      total_score:       { type: 'number' },
                      signals:           { type: 'array', items: { type: 'string' } },
                      disqualified:      { type: 'boolean' },
                      disqualify_reason: { type: 'string' },
                    },
                    required: ['business_name', 'franchise_score', 'ownership_score', 'total_score', 'signals', 'disqualified'],
                  }
                }
              },
              required: ['businesses'],
            }
          }
        ],
        tool_choice: { type: 'auto' },
        messages: [{
          role: 'user',
          content: `Search for the top independent locally-owned ${industry} businesses in ${city} that are NOT franchises and NOT part of a corporate chain.

For each business score it:
- franchise_score (0-10): +3 multiple locations same city, +2 4+ years open, +2 200+ reviews 4.2+ stars, +2 systemized team roles, +1 press coverage, +1 social media, +1 hiring posts
- ownership_score (0-10): +3 unique concept no national franchise competitor, +2 strong brand identity, +2 scalable low build-out model, +2 owner appears at growth ceiling, +1 hot franchise category

Disqualify if: already franchising, FDD mentioned, corporate parent, 8+ locations across multiple states.

Find 6-10 businesses then call submit_businesses with your results.`
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Claude API error', detail: err });
    }

    const data = await response.json();

    // Extract the submit_businesses tool call
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_businesses');

    if (!toolUse) {
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      return res.status(500).json({ error: 'No submit_businesses tool call found', stop_reason: data.stop_reason, text_preview: text.slice(0, 300) });
    }

    let businesses = toolUse.input?.businesses || [];

    businesses = businesses
      .filter(b => !b.disqualified)
      .map(b => ({
        ...b,
        city,
        industry,
        ownership_candidate: (b.ownership_score || 0) >= 6,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }));

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
