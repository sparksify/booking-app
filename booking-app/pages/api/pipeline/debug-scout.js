export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
      system: 'You are a scout. When asked, return ONLY a valid JSON array of businesses.',
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: 'Find 2 top rated independent restaurants in Dallas TX. Return as JSON array: [{"business_name":"name","franchise_score":7}]' }],
    }),
  });

  const data = await response.json();
  return res.status(200).json({
    stop_reason: data.stop_reason,
    content_types: data.content?.map(b => b.type),
    text_blocks: data.content?.filter(b => b.type === 'text').map(b => b.text),
    full_content_count: data.content?.length,
  });
}
