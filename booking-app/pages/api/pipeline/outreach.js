export const config = { maxDuration: 300 };

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ═══════════════════════════════════════════════════════════════════
// EDIT THIS BLOCK to change how your emails sound.
// Can be overridden per-run by passing "style_instructions" in the
// request body, no redeploy needed.
// ═══════════════════════════════════════════════════════════════════
const DEFAULT_STYLE_INSTRUCTIONS = `
VOICE AND FORMAT — match these example emails exactly in tone, rhythm, and structure.
Short lines. One idea per line. Generous line breaks. Understated confidence.

=== EXAMPLE EMAIL 1 (written for a restaurant called Whiskey Bird, owner Anthony) ===
Anthony,

We've been studying restaurant concepts in Atlanta that look like they could work beyond a single location.

Whiskey Bird kept coming up.

Nearly 3,000 reviews, a 4.8-star rating, a strong brunch/cocktail program, and the dine-in + takeout model all stood out.

So we did something a little unusual:

We put together a white paper on Whiskey Bird.

It breaks down your positioning, the competitive landscape around you, and a few opportunities we noticed that competitors don't seem to be taking advantage of.

No pitch attached. We already did the work.

Want me to send it over?

— Steve
Halloway
=== END EXAMPLE 1 ===

=== EXAMPLE EMAIL 2 (follow-up, same business) ===
Anthony,

Following up because there was one part of the Whiskey Bird research I thought you might find particularly interesting.

We mapped the nearby concepts competing for the same brunch, cocktail, and casual dining customer.

Most of them are competing in roughly the same way.

Whiskey Bird isn't.

There are a few advantages in your current model that become especially interesting when you look at the business through the lens of expansion.

We included the full breakdown in the white paper.

Happy to send you a copy — want it?

— Steve
Halloway
=== END EXAMPLE 2 ===

STRUCTURAL RULES derived from the examples:
- Email 1 opens: "We've been studying [industry-appropriate phrase] concepts in [city] that look like they could work beyond a single location." Adapt naturally per industry (fitness concepts, wellness concepts, etc.)
- "[Business name] kept coming up." as its own line.
- Then weave in 2-4 REAL specifics from the data provided (review count, rating, signal details) in one natural sentence.
- "So we did something a little unusual:" pivot, then the white paper reveal.
- White paper covers: their positioning, the competitive landscape around them, and opportunities competitors are not taking advantage of.
- "No pitch attached. We already did the work." — keep this reciprocity line or a very close variant.
- Email 1 CTA: "Want me to send it over?"
- Email 2: reference ONE specific angle from the research (competitive mapping), contrast them against nearby competitors, use the phrase "through the lens of expansion" or a close variant. CTA: "Happy to send you a copy — want it?"
- CRITICAL: The word "franchise" must NEVER appear in email 1. Email 2 may reference expansion but must NOT pitch franchising.
- Sign every email: "— Steve" on one line, "Halloway" on the next.
`;
// ═══════════════════════════════════════════════════════════════════

const HARD_RULES = `
HARD RULES — these are absolute, no exceptions:
- NEVER introduce Steve in the body text ("My name is Steve", "I'm Steve"). The sign-off "— Steve / Halloway" is the ONLY place his name appears.
- NEVER use the words: broker, advisor, consultant, commission, fee, paid, earn
- NEVER use the word "franchise" in email 1 under any circumstances.
- NEVER fabricate facts about the business or its competition — only use details provided. If a detail was not provided, do not invent it.
- NEVER be generic — every email must be visibly about THIS business.

Return ONLY valid JSON in this exact shape, no markdown fences:
{"email1":{"subject":"...","body":"..."},"email2":{"subject":"...","body":"..."}}
Subject lines: lowercase-leaning, curiosity-driven, under 6 words, no clickbait. Examples of the right feel: "a white paper on Whiskey Bird", "the Whiskey Bird research", "what we noticed about Whiskey Bird"
`;

function getFirstName(fullName) {
  if (!fullName) return null;
  return fullName.trim().split(' ')[0];
}

async function writeSequence(biz, styleInstructions) {
  const { business_name, email_owner, industry, signal, rating, review_count, city } = biz;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Write two cold outreach emails from Steve at Halloway (halloway.co) to the owner of an independent local business, following the style guide below precisely.

Business: ${business_name}
Owner first name to address: ${getFirstName(email_owner) || 'there'}
Industry: ${industry || 'unknown'}
City: ${city || 'unknown'}
${signal ? `What we noticed about them: ${signal}` : ''}
${rating ? `Rating: ${rating} stars across ${review_count || '?'} reviews` : ''}

${styleInstructions}

${HARD_RULES}`,
      }],
    }),
  });
  const d = await r.json();
  const text = d.content?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response from Claude');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
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

async function outreachOne(biz, styleInstructions) {
  const { email } = biz;
  if (!email) return { ...biz, outreach_status: 'skipped_no_email' };
  const duplicate = await isDuplicate(email);
  if (duplicate) return { ...biz, outreach_status: 'skipped_duplicate' };
  let sequence;
  try {
    sequence = await writeSequence(biz, styleInstructions);
  } catch (e) {
    return { ...biz, outreach_status: 'failed_sequence_write', error: e.message };
  }
  const loaded = await addLeadToSmartlead(biz, sequence);
  return { ...biz, outreach_status: loaded ? 'loaded' : 'failed_smartlead', sequence };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses, style_instructions } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });
  if (!SMARTLEAD_API_KEY || !SMARTLEAD_CAMPAIGN_ID) return res.status(500).json({ error: 'Missing Smartlead config' });

  const styleInstructions = (style_instructions && style_instructions.trim().length > 0)
    ? style_instructions.trim()
    : DEFAULT_STYLE_INSTRUCTIONS;

  try {
    const results = await Promise.all(businesses.map(biz => outreachOne(biz, styleInstructions)));
    const loaded  = results.filter(r => r.outreach_status === 'loaded');
    const skipped = results.filter(r => r.outreach_status?.startsWith('skipped'));
    const failed  = results.filter(r => r.outreach_status?.startsWith('failed'));
    return res.status(200).json({ total: results.length, loaded: loaded.length, skipped: skipped.length, failed: failed.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
