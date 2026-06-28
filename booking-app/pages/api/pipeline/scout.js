export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  const systemPrompt = `You are a franchise development scout. Find independent non-franchised businesses in a specific city and industry that show strong signals of being franchise-ready.

FRANCHISE READINESS SCORE (0-10):
+3 Multiple locations in same city
+2 4+ years in business
+2 200+ reviews at 4.2+ stars
+2 Systemized job titles
+1 Local press or awards
+1 Consistent social media
+1 Detailed hiring posts
+1 Owner has public profile
+1 Multiple revenue streams

OWNERSHIP SIGNAL SCORE (0-10):
+3 Unique concept with no national franchise competitor
+2 Strong visual brand or cult following
+2 Scalable unit economics
+2 Owner appears at growth ceiling
+1 Category hot in franchise buyer demand

DISQUALIFY if: already franchising, corporate parent, national chain, FDD mention, 8+ locations across states.

After your research, output ONLY a JSON array as your final response with no text after the closing bracket:
[{"business_name":"Name","city":"City, State","industry":"Industry","website":"url or null","owner_name":"First Last or null","domain":"domain.com or null","franchise_score":7,"ownership_score":5,"total_score":12,"ownership_candidate":true,"signals":["Signal 1","Signal 2"],"disqualified":false,"disqualify_reason":null}]`;

  const userPrompt = `Find franchise-ready independent businesses in ${city} in the ${industry} industry. Search for top-rated local businesses, award lists, Best of ${city} coverage, and highly-reviewed independents. Output 8-15 results as a JSON array sorted by total_score descending.`;

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
        max_tokens: 8000,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Claude API error', detail: err });
    }

    const data = await response.json();

    const allText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    let businesses = [];
    let parseError = null;

    const attempts = [
      () => { const s=allText.lastIndexOf('['),e=allText.lastIndexOf(']'); if(s!==-1&&e>s) return JSON.parse(allText.slice(s,e+1)); },
      () => { const c=allText.replace(/```json|```/g,'').trim(),s=c.indexOf('['),e=c.lastIndexOf(']'); if(s!==-1&&e>s) return JSON.parse(c.slice(s,e+1)); },
    ];

    for (const attempt of attempts) {
      if (businesses.length) break;
      try { const r=attempt(); if(Array.isArray(r)&&r.length) businesses=r; } catch(e) { parseError=e.message; }
    }

    if (!businesses.length) {
      return res.status(500).json({ error: 'Failed to parse response', parseError, rawPreview: allText.slice(0,800) });
    }

    businesses = businesses
      .filter(b => !b.disqualified)
      .map(b => ({
        ...b,
        ownership_candidate: (b.ownership_score||0) >= 6,
        id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      }));

    return res.status(200).json({
      city, industry,
      count: businesses.length,
      ownership_candidates: businesses.filter(b=>b.ownership_candidate).length,
      businesses,
      run_at: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
