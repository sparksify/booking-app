export const config = { maxDuration: 300 };

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ═══════════════════════════════════════════════════════════════════
// EDIT THIS BLOCK to change how your emails sound.
// Can also be overridden per-run by passing "style_instructions"
// in the request body, no redeploy needed.
// ═══════════════════════════════════════════════════════════════════
const DEFAULT_STYLE_INSTRUCTIONS = `
APPROACH — position this as research we have already done on their business:
The email should feel like: "We've been researching your business. We like what
you're doing — specifically [real detail], [real detail]. Would you like us to
send over a white paper on your business and your current competition in the area?"

FRAMEWORK — every email must follow this structure:
1. Open with evidence we researched THEM specifically — reference 1-2 real,
   specific things about their business from the data provided (what they offer,
   their concept, their standing in the market). Genuine and specific, not flattery.
2. One sentence connecting what we noticed to why it stands out in their market.
3. CTA — offer the white paper. Always phrase the ask as offering to send over
   a white paper on their business and their current competition in the area.
   Frame it as already prepared, zero obligation.

LENGTH — keep it tight:
- Email 1: 3-4 short paragraphs maximum. Each paragraph 1-2 sentences.
- Email 2 (follow-up): 2-3 short paragraphs. Reference the white paper offer
  again with a different angle — e.g. mention one thing the competition analysis
  covers. Not a generic bump.

TONE: professional, researched, understated. Like an analyst who did homework,
not a salesperson with a template.
`;
// ═══════════════════════════════════════════════════════════════════

const HARD_RULES = `
HARD RULES — these are absolute, no exceptions:
- NEVER introduce Steve by name. Do not say "My name is Steve" or "I'm Steve" or any variation.
- NEVER use the words: broker, advisor, consultant, commission, fee, paid, earn
- NEVER say "I only get paid if" or any version of that
- NEVER say "no fluff" or "no pitch decks" or "no pressure"
- NEVER be generic — every email must reference something specific to THIS business
- NEVER fabricate facts about the business or its competition — only use details provided

Return ONLY valid JSON in this exact shape, no markdown fences:
{"email1":{"subject":"...","body":"..."},"email2":{"subject":"...","body":"..."}}
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
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Write two cold outreach emails for Steve Sparks at Halloway (halloway.co), reaching out to the owner of an independent local business.

Business: ${business_name}
Owner: ${email_owner || 'unknown'}
Industry: ${industry || 'unknown'}
City: ${city || 'unknown'}
${signal ? `What we noticed: ${signal}` : ''}
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
