export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  try {
    // Step 1: Research
    const researchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Find the top 10 independent locally-owned ${industry} businesses in ${city} that are NOT franchises. For each one find: owner name, years open, number of locations, website domain, any awards or press. Plain text summary only.` }],
      }),
    });
    const researchData = await researchRes.json();
    const researchText = (researchData.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').slice(0, 3000);

    // Step 2: Score and return JSON using a strict prompt
    const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: 'You are a JSON API. You only output raw JSON arrays. Never output any text before or after the JSON array. Never use markdown. Your entire response must be parseable by JSON.parse().',
        messages: [
          {
            role: 'user',
            content: `Score these ${industry} businesses in ${city} and return a JSON array.

Research data:
${researchText}

Scoring rules:
- franchise_score (0-10): +3 multiple locations same city, +2 4+ years open, +2 high reviews, +2 systemized team, +1 each for press/social/hiring
- ownership_score (0-10): +3 unique concept no national competitor, +2 strong brand, +2 scalable economics, +2 owner at growth ceiling, +1 hot category
- disqualify if: already franchising, FDD mention, corporate parent, 8+ locations across multiple states

Return this exact JSON structure with no other text:
[{"business_name":"string","city":"${city}","industry":"${industry}","website":"string or null","owner_name":"string or null","domain":"string or null","franchise_score":0,"ownership_score":0,"total_score":0,"ownership_candidate":false,"signals":["string"],"disqualified":false,"disqualify_reason":null}]`
          },
          {
            role: 'assistant',
            content: '[',
          }
        ],
      }),
    });

    const scoreData = await scoreRes.json();
    const rawText = (scoreData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    // The assistant was primed to start with '[' so prepend it
    const jsonStr = '[' + rawText;

    let businesses = [];
    try {
      businesses = JSON.parse(jsonStr);
    } catch(e) {
      // Try to find array in response anyway
      const s = jsonStr.lastIndexOf('[');
      const en = jsonStr.lastIndexOf(']');
      if (s !== -1 && en > s) {
        try {
          businesses = JSON.parse(jsonStr.slice(s, en + 1));
        } catch(e2) {
          return res.status(500).json({ error: 'Parse failed', detail: e2.message, raw: jsonStr.slice(0, 400) });
        }
      } else {
        return res.status(500).json({ error: 'No JSON array found', raw: jsonStr.slice(0, 400) });
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
