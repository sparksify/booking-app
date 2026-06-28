export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    // Step 1: Research with web search
    const researchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Research the top independent locally-owned ${industry} businesses in ${city}. Find their owners, how long they have been open, number of locations, and any awards or press coverage. Summarize your findings in plain text.` }],
      }),
    });

    const researchData = await researchRes.json();
    const researchText = (researchData.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');

    // Step 2: Score and format as JSON (no web search, pure generation)
    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Based on this research about ${industry} businesses in ${city}:

${researchText}

Score each business and return ONLY a JSON array. No text before or after. No markdown. Start with [ and end with ].

Scoring:
Franchise score (0-10): +3 multiple locations, +2 4+ years, +2 200+ reviews 4.2+, +2 systemized roles, +1 each for press/social/hiring posts/owner profile/multiple revenue
Ownership score (0-10): +3 unique concept no national competitor, +2 strong brand, +2 scalable economics, +2 owner at growth ceiling, +1 hot category

Disqualify if: already franchising, corporate parent, FDD mention, 8+ locations across states.

Use only simple ASCII characters in all string values. No apostrophes in business names - use plain text only.

Output format (start response with [ character):
[{"business_name":"Name","city":"${city}","industry":"${industry}","website":"domain.com or null","owner_name":"First Last or null","domain":"domain.com or null","franchise_score":7,"ownership_score":5,"total_score":12,"ownership_candidate":false,"signals":["Signal 1","Signal 2","Signal 3"],"disqualified":false,"disqualify_reason":null}]`
        }],
      }),
    });

    const scoreData = await scoreRes.json();
    const scoreText = (scoreData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    // Parse JSON
    let businesses = [];
    const clean = scoreText.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('[');
    const e = clean.lastIndexOf(']');

    if (s === -1 || e <= s) {
      return res.status(500).json({ error: 'No JSON array found', raw: clean.slice(0, 500) });
    }

    try {
      businesses = JSON.parse(clean.slice(s, e + 1));
    } catch(parseErr) {
      // Sanitize and retry
      const sanitized = clean.slice(s, e + 1)
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[^\x20-\x7E\n\r\t]/g, '');
      try {
        businesses = JSON.parse(sanitized);
      } catch(err2) {
        return res.status(500).json({ error: 'Parse failed after sanitize', detail: err2.message, raw: clean.slice(s, s + 300) });
      }
    }

    businesses = businesses
      .filter(b => !b.disqualified)
      .map(b => ({
        ...b,
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
