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
        messages: [{
          role: 'user',
          content: `List 8 well-known independent (non-franchised) restaurants or food businesses in ${city} that are locally owned and highly rated. For each one provide realistic scores.

Return ONLY a JSON array, nothing else, no markdown:
[{"business_name":"Name","city":"${city}","industry":"${industry}","website":"domain.com","owner_name":"First Last","domain":"domain.com","franchise_score":7,"ownership_score":5,"total_score":12,"ownership_candidate":false,"signals":["Signal 1","Signal 2","Signal 3"],"disqualified":false,"disqualify_reason":null}]`
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Claude API error', detail: err });
    }

    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    let businesses = [];
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const s = clean.indexOf('[');
      const e = clean.lastIndexOf(']');
      if (s !== -1 && e > s) businesses = JSON.parse(clean.slice(s, e + 1));
    } catch(err) {
      return res.status(500).json({ error: 'Parse failed', raw: text.slice(0, 500) });
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
