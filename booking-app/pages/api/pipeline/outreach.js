export const config = { maxDuration: 300 };

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function getFirstName(fullName) {
  if (!fullName) return null;
  return fullName.trim().split(' ')[0];
}

async function writeSequence(biz) {
  const { business_name, city, email_owner, industry, signal } = biz;

  const firstName = getFirstName(email_owner);

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
        content: `You are writing a cold outreach email sequence for Steve Sparks, Managing Partner at Halloway (halloway.co).

Steve works with independent business owners to explore whether franchising their concept makes sense. He is a broker — he only gets paid when a deal closes, so he has no reason to waste anyone's time.

Write exactly 2 emails using Alex Hormozi's cold outreach style:
- Open with the personalization signal to make them feel seen — reference it naturally, don't be cheesy about it
- Short sentences. Direct. No fluff. No "I hope this email finds you well."
- Never use the word "consultant" or position Steve as one
- The CTA is always: Steve has a 5-minute video that explains the whole process — ask if they want him to send it over
- Sound like a real person, not a marketing department
- One ask per email, nothing more

Personalization signal to open with: ${signal || `${business_name} in ${city}`}
Owner first name: ${firstName || 'there'}
Business: ${business_name}
Location: ${city}
Industry: ${industry || 'independent business'}

Email 1 — The opener. 4-6 sentences max. Subject line included.
Email 2 — Follow-up. 3-4 sentences. Sent 4 days later. Don't be needy. Reference the video. Subject line included.

Return ONLY valid JSON, no markdown:
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
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }
}

async function addLeadToSmartlead(biz, sequence) {
  const { email, email_owner, business_name } = biz;
  const firstName = getFirstName(email_owner) || 'there';
  const lastName = email_owner ? email_owner.trim().split(' ').slice(1).join(' ') : '';

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

async function outreachOne(biz) {
  const { email } = biz;

  if (!email) return { ...biz, outreach_status: 'skipped_no_email' };

  const duplicate = await isDuplicate(email);
  if (duplicate) return { ...biz, outreach_status: 'skipped_duplicate' };

  let sequence;
  try {
    sequence = await writeSequence(biz);
  } catch (e) {
    return { ...biz, outreach_status: 'failed_sequence_write', error: e.message };
  }

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
