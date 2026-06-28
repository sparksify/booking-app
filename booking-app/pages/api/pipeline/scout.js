export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { city, industry } = req.body;
  if (!city || !industry) return res.status(400).json({ error: 'city and industry required' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  const systemPrompt = `You are a franchise development scout. Find independent (non-franchised) businesses in a specific city and industry that show strong signals of being franchise-ready.

Score each business on two dimensions:

FRANCHISE READINESS SCORE (0-10):
+3 Multiple locations in same city
+2 4+ years in business
+2 200+ reviews at 4.2+ stars
+2 Systemized job titles (manager, ops director, trainer)
+1 Local press or awards
+1 Consistent social media
+1 Detailed hiring posts
+1 Owner has public profile
+1 Multiple revenue streams

OWNERSHIP SIGNAL SCORE (0-10):
+3 Unique concept with no national franchise competitor
+2 Strong visual brand / cult following
+2 Scalable unit economics (low build-out, high margin)
+2 Owner appears at growth ceiling
+1 Category hot in franchise buyer demand

DISQUALIFY if: already franchising, corporate parent, national chain, FDD mention, 8+ locations across states.

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "business_name": "Name",
    "city": "City, State",
    "industry": "Industry",
    "website": "url or null",
    "owner_name": "First Last or null",
    "domain": "domain.com or null",
    "franchise_score": 7,
    "ownership_score": 5,
    "total_score": 12,
    "ownership_candidate": true,
    "signals": ["Signal 1", "Signal 2", "Signal 3"],
    "disqualified": false,
    "disqualify_reason": null
  }
]

Find 8-15 businesses. Only include non-disqualified ones. Sort by total_score descending.`;

  const userPrompt = `Find franchise-ready independent businesses in ${city} in the ${industry} industry. Search for top-rated local businesses, award lists, Best of ${city} editorial coverage, and highly-reviewed independent operators.`;

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
    const rawText = data.content.filter(b => b.type === 'text').map(b => b.text).join('');

    let businesses = [];
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      const start = clean.indexOf('[');
      const end = clean.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        businesses = JSON.parse(clean.slice(start, end + 1));
      }
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse response', raw: rawText });
    }

    businesses = businesses.map(b => ({
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
