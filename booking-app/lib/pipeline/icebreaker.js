const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Voice for the Genesis draft. The sending system is not called from this file.
export const DEFAULT_STYLE_INSTRUCTIONS = `
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

=== END EXAMPLE 2 ===

STRUCTURAL RULES derived from the examples:
- Email 1 opens: "We've been studying [industry-appropriate phrase] concepts in [city] that look like they could work beyond a single location." Adapt naturally per industry (fitness concepts, wellness concepts, etc.)
- "[Business name] kept coming up." as its own line.
- Then weave in 2-4 REAL specifics from the data provided (review count, rating, signal details, website excerpt) in one natural sentence.
- "So we did something a little unusual:" pivot, then the white paper reveal.
- White paper covers: their positioning, the competitive landscape around them, and opportunities competitors are not taking advantage of.
- "No pitch attached. We already did the work." — keep this reciprocity line or a very close variant.
- Email 1 CTA: "Want me to send it over?"
- Email 2: reference ONE specific angle from the research (competitive mapping), contrast them against nearby competitors, use the phrase "through the lens of expansion" or a close variant. CTA: "Happy to send you a copy — want it?"
- CRITICAL: The word "franchise" must NEVER appear in email 1. Email 2 may reference expansion but must NOT pitch franchising.
- Sign every email: "— %sender-firstname%" on one line (write this EXACT literal text including the percent signs — it is a mail-merge variable, do NOT replace it with an actual name), "Halloway" on the next.
`;

const HARD_RULES = `
HARD RULES — these are absolute, no exceptions:
- GREETING: If an owner first name is provided, open with "FirstName," on its own line. If the owner name is "(NO NAME KNOWN - see greeting rule)", write NO greeting line at all — start the email directly with the first sentence. NEVER write "there," or "Hi there" or "Owner" or any placeholder greeting.
- NO SIGN-OFF: Do not end with any name, signature, dash-name, or company name. End email 1 with "Want me to send it over?" and email 2 with its final CTA question. The sending system appends the signature automatically.
- NEVER introduce the sender by name in the body text. The sign-off "— %sender-firstname% / Halloway" is the ONLY place a name appears, and it must use the literal variable %sender-firstname%, never a real name.
- NEVER use the words: broker, advisor, consultant, commission, fee, paid, earn
- NEVER use the word "franchise" in email 1 under any circumstances.
- NEVER fabricate facts about the business or its competition — only use details provided. If a detail was not provided, do not invent it.
- NEVER be generic — every email must be visibly about THIS business.
- Use the website excerpt only for details that are actually written there.

Return ONLY valid JSON in this exact shape, no markdown fences:
{"email1":{"subject":"...","body":"..."},"email2":{"subject":"...","body":"..."}}
Subject lines: lowercase-leaning, curiosity-driven, under 6 words, no clickbait. Examples of the right feel: "a white paper on Whiskey Bird", "the Whiskey Bird research", "what we noticed about Whiskey Bird"
`;

function getFirstName(fullName) {
  if (!fullName) return null;
  return fullName.trim().split(' ')[0];
}

export async function draftSequence(biz, styleInstructions = DEFAULT_STYLE_INSTRUCTIONS) {
  const { business_name, email_owner, owner_name, industry, signal, rating, review_count, city, website, website_excerpt } = biz;
  const greetingName = email_owner || owner_name;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
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
        content: `Write two cold emails from the Halloway team (halloway.co) to the owner of an independent local business, following the style guide below precisely.

Business: ${business_name}
Website: ${website || 'unknown'}
Owner first name to address: ${getFirstName(greetingName) || '(NO NAME KNOWN - see greeting rule)'}
Industry: ${industry || 'unknown'}
City: ${city || 'unknown'}
${signal ? `What we noticed about them: ${signal}` : ''}
${website_excerpt ? `Excerpt from their website (use a real detail from this, do not invent beyond it): ${String(website_excerpt).slice(0, 1200)}` : ''}
${rating ? `Rating: ${rating} stars across ${review_count || '?'} reviews` : ''}

${styleInstructions}

${HARD_RULES}`,
      }],
    }),
  });
  const payload = await response.json();
  const text = payload.content?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response from Claude');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

/** Draft copy only. This function never hands the draft to a sending provider. */
export async function draftIcebreaker(biz, { dryRun = false, styleInstructions = DEFAULT_STYLE_INSTRUCTIONS } = {}) {
  if (dryRun) {
    const first = getFirstName(biz.email_owner || biz.owner_name);
    return {
      email1: {
        subject: `a note on ${biz.business_name || 'the business'}`.toLowerCase(),
        body: `${first ? `${first},\n\n` : ''}This draft was generated without calling a model. It has not been sent.\n\nWant me to send it over?`,
      },
      email2: {
        subject: 'the research',
        body: 'Following up on the draft.\n\nHappy to send you a copy — want it?',
      },
      sent: false,
    };
  }
  if (!ANTHROPIC_API_KEY) return { sent: false, error: 'Missing ANTHROPIC_API_KEY' };
  const sequence = await draftSequence(biz, styleInstructions);
  return { ...sequence, sent: false };
}
