export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const { city, industry } = req.body;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      tools: [{
        name: 'submit_businesses',
        description: 'Submit businesses.',
        input_schema: {
          type: 'object',
          properties: {
            businesses: { type: 'array', items: { type: 'object', properties: { business_name: { type: 'string' }, disqualified: { type: 'boolean' }, disqualify_reason: { type: 'string' } }, required: ['business_name','disqualified'] } }
          },
          required: ['businesses'],
        }
      }],
      tool_choice: { type: 'tool', name: 'submit_businesses' },
      messages: [{ role: 'user', content: `List 5 independent ${industry} businesses in ${city} and call submit_businesses.` }],
    }),
  });

  const data = await scoreRes.json();
  const toolUse = (data.content || []).find(b => b.type === 'tool_use');
  return res.status(200).json({
    stop_reason: data.stop_reason,
    tool_found: !!toolUse,
    businesses_count: toolUse?.input?.businesses?.length || 0,
    first_business: toolUse?.input?.businesses?.[0] || null,
    error: data.error || null,
  });
}
