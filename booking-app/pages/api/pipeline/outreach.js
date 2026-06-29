export const config = { maxDuration: 300 };

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function getFirstName(fullName) {
  if (!fullName) return null;
  return fullName.trim().split(' ')[0];
}

async function writeSequence(biz) {
  const { business_name, email_owner, industry, signal, rating, review_count } = biz;
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
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are writing cold outreach emails for Steve Sparks, Managing Partner at Halloway (halloway.co). Steve helps independent business owners figure out if franchising their concept makes sense. He is a broker — he only earns money when a deal closes, so he has no interest in wasting anyone's time.

FRAMEWORK — use this exact structure for every email:
1. Personalized proof — open with something specific and real about this business (reviews, concept, operational detail, signal)
2. Strategic question — immediately create tension by raising the real question (is it repeatable? is the concept location-dependent? can it be taught to someone else? does the math work?)
3. Risk reversal — make it clear this is about finding out IF it makes sense, not pitching them on franchising
4. CTA — always end with "Should I send it?" never "Want me to send it over?"

TONE RULES — strictly follow these:
- Never just compliment. Every proof point must immediately raise a question or tension
- Never say "I only get paid if a deal closes" — it creates skepticism before trust
- Never say "consultant" or position Steve as one
- Short paragraphs. One idea per paragraph. Direct.
- Sound skeptical and analytical, not enthusiastic
- The follow-up email must return to the specific strategic question about THIS business — never send a generic bump
- "Should I send it?" is the only acceptable CTA format

GOOD EXAMPLE (use this as your model):
Subject: Whiskey Bird + Little Bird

Anthony — Whiskey Bird plus Little Bird caught my eye.

Most restaurants struggle to make one model run cleanly. You have a dine-in concept, a takeout concept, brunch, dinner, cocktails, and online ordering under one roof.

That usually means one of two things:

Either the operation is too complex to scale, or you have a model that could be more valuable than a single-location restaurant.

I help independent restaurant owners figure out which one is true before they spend a dollar on franchising.

I have a 5-minute video that shows how we evaluate whether a concept is actually franchise-ready.

Should I send it over?

---

FOLLOW-UP EXAMPLE (specific, not generic):
Subject: Re: Whiskey Bird + Little Bird

Anthony — quick bump.

The reason I reached out is because Whiskey Bird/Little Bird already has something franchise buyers look for: more than one revenue path inside the same operating system.

The video will show you whether that is actually an asset for scaling, or just added complexity.

Should I send it?

---

Now write 2 emails for this business:

Owner first name: ${firstName || 'there'}
Business name: ${business_name}
Industry: ${industry || 'independent business'}
Personalization signal: ${signal || `${business_name} caught my attention`}
${rating ? `Google rating: ${rating} stars${review_count ? ` across ${review_count} reviews` : ''}` : ''}

Email 1 — The opener. 5-8 sentences across short paragraphs. Subject line included.
Email 2 — Follow-up sent 4 days later. Returns to the specific strategic question raised in email 1. 4-6 sentences. Subject line included.

Return ONLY valid JSON, no markdown, no explanation:
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
            email1_body:    sequence.email1.body,
            email2_subject: sequence.email2.subject,
            email2_body:    sequence.email2.body,
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

    const loaded  = results.filter(r => r.outreach_status === 'loaded');
    const skipped = results.filter(r => r.outreach_status?.startsWith('skipped'));
    const failed  = results.filter(r => r.outreach_status?.startsWith('failed'));

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
