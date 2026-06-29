export const config = { maxDuration: 300 };

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Claude writes the sequence ───────────────────────────────────────────────

async function writeSequence(biz) {
  const { business_name, city, owner_name, industry } = biz;

  // Use first name only for personalization
  const firstName = owner_name
    ? owner_name.split(/\s+and\s+|\s*&\s*|,\s*/)[0].trim().split(' ')[0]
    : null;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are writing a cold outreach email sequence for Steve Sparks, a franchise broker and Managing Partner at Halloway (halloway.co).

Steve helps independent business owners explore whether franchising their concept makes sense. He earns $20K per closed deal but only works with businesses that are a genuine fit. He is not a consultant selling a service — he is a broker who gets paid at close.

Write exactly 2 emails. Use Alex Hormozi's cold outreach style:
- Lead with a hook that names the person and their situation specifically
- No fluff, no corporate speak, no "I hope this email finds you well"
- Short sentences. Direct. Respect their time.
- One clear ask per email — a simple reply, not a call booking link
- Sound like a real person wrote it, not a marketing department
- The goal is to start a conversation, not close a deal in email

Hook formula to use: Audience Call-Out
Structure: [Name their identity] + [Acknowledge what they built] + [Open a door they didn't know existed]

Business details:
- Owner: ${firstName || 'there'}
- Business: ${business_name}
- Location: ${city}
- Industry: ${industry || 'independent business'}

Email 1 — The opener. 4-6 sentences max. Subject line included.
Email 2 — The follow-up. 3-4 sentences. Sent 4 days later. Reference email 1 without being needy. Subject line included.

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "email1": {
    "subject": "...",
    "body": "..."
  },
  "email2": {
    "subject": "...",
    "body": "..."
  }
}`,
      }],
    }),
  });

  const d = await r.json();
  const text = d.content?.[0]?.text?.trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    // Strip any markdown fences if Claude added them
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }
}

// ── Smartlead API calls ──────────────────────────────────────────────────────

async function addLeadToSmartlead(biz, sequence) {
  const { email, owner_name, business_name } = biz;
  const firstName = owner_name
    ? owner_name.split(/\s+and\s+|\s*&\s*|,\s*/)[0].trim().split(' ')[0]
    : 'there';
  const lastName = owner_name
    ? owner_name.split(/\s+and\s+|\s*&\s*|,\s*/)[0].trim().split(' ').slice(1).join(' ')
    : '';

  const r = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SMARTLEAD_CAMPAIGN_ID}/leads?api_key=${SMARTLEAD_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_list: [{
          email,
          first_name: firstName,
          last_name: lastName,
          company_name: business_name,
          custom_fields: {
            email1_subject: sequence.email1.subject,
            email1_body: sequence.email1.body,
            email2_subject: sequence.email2.subject,
            email2_body: sequence.email2.body,
          },
        }],
      }),
    }
  );
  return r.ok;
}

// ── Duplicate check ──────────────────────────────────────────────────────────

async function isDuplicate(email) {
  try {
    const r = await fetch(
      `https://server.smartlead.ai/api/v1/leads?api_key=${SMARTLEAD_API_KEY}&email=${encodeURIComponent(email)}`
    );
    const d = await r.json();
    return Array.isArray(d) && d.length > 0;
  } catch (e) {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function outreachOne(biz) {
  const { email, business_name } = biz;

  if (!email) {
    return { ...biz, outreach_status: 'skipped_no_email' };
  }

  // Duplicate check
  const duplicate = await isDuplicate(email);
  if (duplicate) {
    return { ...biz, outreach_status: 'skipped_duplicate' };
  }

  // Write sequence
  let sequence;
  try {
    sequence = await writeSequence(biz);
  } catch (e) {
    return { ...biz, outreach_status: 'failed_sequence_write', error: e.message };
  }

  // Load to Smartlead
  const loaded = await addLeadToSmartlead(biz, sequence);

  return {
    ...biz,
    outreach_status: loaded ? 'loaded' : 'failed_smartlead',
    sequence,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses array required' });
  }

  if (!SMARTLEAD_API_KEY || !SMARTLEAD_CAMPAIGN_ID) {
    return res.status(500).json({ error: 'Missing Smartlead config' });
  }

  try {
    // Run in parallel
    const results = await Promise.all(businesses.map(biz => outreachOne(biz)));

    const loaded = results.filter(r => r.outreach_status === 'loaded');
    const skipped = results.filter(r => r.outreach_status?.startsWith('skipped'));
    const failed = results.filter(r => r.outreach_status?.startsWith('failed'));

    return res.status(200).json({
      total: results.length,
      loaded: loaded.length,
      skipped: skipped.length,
      failed: failed.length,
      results,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
