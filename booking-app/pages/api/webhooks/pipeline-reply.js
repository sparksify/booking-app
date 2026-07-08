import { getSupabaseAdmin } from '@/lib/supabase';

export const config = { maxDuration: 30 };

async function classifyReply(replyText, businessName, ownerName, isOwnershipCandidate) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      tools: [{
        name: 'submit_classification',
        description: 'Submit the reply classification and drafted response.',
        input_schema: {
          type: 'object',
          properties: {
            classification: { type: 'string', enum: ['INTERESTED', 'NOT_NOW', 'NOT_INTERESTED', 'QUESTION'] },
            drafted_response: { type: 'string' },
            summary: { type: 'string' },
          },
          required: ['classification', 'drafted_response', 'summary'],
        }
      }],
      tool_choice: { type: 'tool', name: 'submit_classification' },
      messages: [{ role: 'user', content: `Classify this reply from ${ownerName || 'the owner'} of ${businessName} and draft a response.\n\nReply: "${replyText}"\n\nContext: Steve Sparks at Halloway reached out about franchising their business. ${isOwnershipCandidate ? 'This is a high-priority ownership candidate.' : ''}\n\nClassifications:\n- INTERESTED: wants to talk or learn more\n- NOT_NOW: open to it but not right now\n- NOT_INTERESTED: hard no\n- QUESTION: asking something specific\n\nFor INTERESTED include [CALENDLY_LINK] placeholder in drafted_response.\n\nCall submit_classification now.` }],
    }),
  });
  const data = await res.json();
  const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_classification');
  return toolUse?.input || { classification: 'QUESTION', drafted_response: '', summary: replyText.slice(0, 100) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = process.env.SMARTLEAD_WEBHOOK_SECRET;
  if (webhookSecret) {
    const sig = req.headers['x-smartlead-signature'] || req.headers['authorization'];
    if (sig !== webhookSecret) return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body;
  const supabase = getSupabaseAdmin();

  try {
    const email = payload?.lead_email || payload?.email || payload?.from_email;
    const replyText = payload?.reply_message || payload?.message || payload?.email_body || '';

    if (!email || !replyText) return res.status(200).json({ message: 'No reply data found' });

    const { data: prospects } = await supabase
      .from('pipeline_prospects')
      .select('*')
      .ilike('email', email.trim())
      .order('loaded', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    const prospect = prospects?.[0];

    const classification = await classifyReply(
      replyText,
      prospect?.business_name || payload?.company_name || 'Unknown Business',
      prospect?.owner_name || payload?.lead_name,
      prospect?.ownership_candidate || false
    );

    await supabase.from('pipeline_replies').insert({
      prospect_id: prospect?.id || null,
      business_name: prospect?.business_name || payload?.company_name || 'Unknown',
      email,
      reply_text: replyText,
      classification: classification.classification,
      ownership_candidate: prospect?.ownership_candidate || false,
      drafted_response: classification.drafted_response,
      city: prospect?.city || null,
      variant_labels: prospect?.variant_labels || null,
      email_source: prospect?.email_source || null,
      raw_payload: payload,
      reviewed: false,
    });

    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhook && ['INTERESTED', 'QUESTION'].includes(classification.classification)) {
      const isOwnership = prospect?.ownership_candidate;
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${isOwnership ? '🏆' : '💬'} *New Reply — ${classification.classification}*\n${isOwnership ? '*HIGH PRIORITY — Ownership Candidate*\n' : ''}*${prospect?.business_name || 'Unknown'}* (${prospect?.city || ''})\n*From:* ${email}\n*Summary:* ${classification.summary}\n\nView replies: https://www.trykanso.co/dashboard/pipeline`,
        }),
      });
    }

    return res.status(200).json({ received: true, classification: classification.classification, business_name: prospect?.business_name, email });

  } catch (err) {
    console.error('Pipeline webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
