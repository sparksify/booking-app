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
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Write two cold outreach emails for Steve Sparks at Halloway (halloway.co).

FRAMEWORK — every email must follow this exact structure:
1. Personalized proof — one specific thing about this business
2. Strategic question — raise the real tension (is it repeatable? owner-dependent? can it be taught?)
3. Risk reversal — this is about finding out IF it makes sense, not pitching franchising
4. CTA — always end with "Should I send it?" — nothing else

LENGTH — keep it tight:
- Email 1: 4-5 short paragraphs maximum. Each paragraph 1-2 sentences.
- Email 2: 3 short paragraphs maximum.

HARD RULES — these are absolute, no exceptions:
- NEVER introduce Steve by name. Do not say "My name is Steve" or "I'm Steve" or any variation.
- NEVER use the words: broker, advisor, consultant, commission, fee, paid, earn
- NEVER say "I only get paid if" or any version of that
- NEVER say "no fluff" or "no pitch decks" or "no pressure"
- NEVER be generic — every email must reference something specific to THIS business
- The follow-up must return to the specific strategic question from email 1, not a generic bump
- CTA is ALWAYS and ONLY "Should I send it?" — never "Want me to send it over?" or any other variation

GOOD EXAMPLE — match this style and length:
Subject: Whiskey Bird + Little Bird

Anthony — Whiskey Bird plus Little Bird caught my eye.

Most restaurants struggle to make one model run cleanly. You have a dine-in concept, a takeout concept, brunch, dinner, cocktails, and online ordering under one roof.

That usually means one of two things: either the operation is too complex to scale, or you have a model that could be more valuable than a single-location restaurant.

I have a 5-minute video that shows how we evaluate whether a concept is actually franchise-ready.

Should I send it?

---

GOOD FOLLOW-UP EXAMPLE — match this style and length:
Subject: Re: Whiskey Bird + Little Bird

Anthony — quick bump.

The reason I reached out: Whiskey Bird/Little Bird already has something franchise buyers look for — more than one revenue path inside the same operating system.

The video will show you whether that is an asset for scaling, or just added complexity.

Should I send it?

---

Business details:
Owner first name: ${firstName || 'there'}
Business: ${business_name}
Industry: ${industry || 'independent business'}
Signal: ${signal || `${business_name} caught my attention`}
${rating ? `Google: ${rating} stars${review_count ? ` across ${review_count} reviews` : ''}` : ''}

Return ONLY valid JSON, no markdown:
{
  "email1": { "subject": "...", "body": "..." },
  "email2": { "subject": "...", "body": "..." }
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
  return { ...biz, outreach_status: loaded ? 'loaded' : 'failed_smartlead', sequence };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });
  if (!SMARTLEAD_API_KEY || !SMARTLEAD_CAMPAIGN_ID) return res.status(500).json({ error: 'Missing Smartlead config' });

  try {
    const results = await Promise.all(businesses.map(biz => outreachOne(biz)));
    const loaded  = results.filter(r => r.outreach_status === 'loaded');
    const skipped = results.filter(r => r.outreach_status?.startsWith('skipped'));
    const failed  = results.filter(r => r.outreach_status?.startsWith('failed'));
    return res.status(200).json({ total: results.length, loaded: loaded.length, skipped: skipped.length, failed: failed.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
