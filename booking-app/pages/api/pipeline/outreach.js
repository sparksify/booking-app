export const config = { maxDuration: 290 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ── Style presets ──
// Each preset is a distinct voice/approach, not just a tone adjective. The prompt
// fragments below are deliberately different in structure (not just "sound friendlier")
// so the actual emails read differently, not just softer/harder versions of the same email.

const STYLE_PRESETS = {
  hormozi: {
    label: "Hormozi (Direct Offer)",
    instructions: `Write in Alex Hormozi's direct-response style: short punchy sentences, a clear
value-forward hook in the first line, no throat-clearing. Lead with a specific, concrete observation
about the business (not a generic compliment). Make the ask low-friction and specific ("worth a
15-minute call?" not "let me know your thoughts"). Avoid superlatives and hype language.`,
  },
  consultative: {
    label: "Consultative (Advisory)",
    instructions: `Write like an experienced advisor reaching out because you noticed something
relevant to their specific situation, not because you're selling something. Tone is measured,
credible, low-pressure. Reference one specific, real detail about their business that shows you
looked at it. No urgency language, no exclamation points. The ask is an open question, not a pitch.`,
  },
  direct: {
    label: "Direct & Blunt",
    instructions: `Write short, plain, no-fluff. Get to the point in the first sentence. No
compliments, no scene-setting, no rapport-building preamble. State what this is about and what
you're asking, then stop. Under 60 words for the first email.`,
  },
  warm: {
    label: "Warm & Relational",
    instructions: `Write like a genuine, friendly note from someone who respects what they've built.
Warmer tone, slightly more conversational, but still concise. Reference something specific and
genuinely complimentary about the business without being flattering or generic. The ask is soft
and low-pressure ("open to a quick chat sometime?").`,
  },
};

const DEFAULT_STYLE = "consultative";

// ── Guardrails, unchanged from prior version ──
const GUARDRAILS = `
CRITICAL RULES — never violate these:
- Do NOT introduce yourself by name or title in the email body.
- Do NOT mention being a broker, consultant, or any commission/fee structure.
- Do NOT use the words "franchise broker," "commission," or "fee" anywhere.
- Do NOT fabricate facts about the business that weren't provided to you.
- Keep the email under 150 words total.
- Subject line under 8 words, no clickbait, no ALL CAPS, no excessive punctuation.
- Sign off with just a first name — use "Steve" as the sender's name.
`;

// ── Business detail signals ──
// Previously the model defaulted to star rating / review count almost every time because
// it's the easiest structured field to grab. This gives it a menu of signal types and
// explicitly tells it to rotate — not lean on ratings as the default move.

function buildSignalMenu(biz) {
  const signals = [];
  if (biz.rating && biz.review_count) signals.push(`rating: ${biz.rating} stars across ${biz.review_count} reviews`);
  if (biz.description) signals.push(`business description: "${biz.description}"`);
  if (biz.category) signals.push(`category/niche: ${biz.category}`);
  if (biz.address) signals.push(`location: ${biz.address}`);
  if (biz.website) signals.push(`has an active website (${biz.website})`);
  if (biz.duplicate_owner === false && biz.primary_business) signals.push(`owner also runs another location`);
  return signals;
}

async function generateStyledEmail(biz, styleKey, customPrompt) {
  const style = STYLE_PRESETS[styleKey] || STYLE_PRESETS[DEFAULT_STYLE];
  const styleInstructions = customPrompt && customPrompt.trim().length > 0
    ? customPrompt.trim()
    : style.instructions;

  const signals = buildSignalMenu(biz);
  const signalText = signals.length
    ? `Available real signals about this business (use ONE, pick whichever is most interesting — do NOT default to rating/reviews just because it's listed first):\n- ${signals.join("\n- ")}`
    : `No specific business signals available — write a general but still personalized-feeling outreach email using just the business name and owner name.`;

  const prompt = `You are writing a short cold outreach email sequence (2 emails) to the owner of an
independent local business, on behalf of a franchise growth consultancy exploring whether they'd
be a good fit to eventually franchise their concept.

Business: ${biz.business_name}
Owner: ${biz.owner_name || biz.email_owner || "the owner"}
${signalText}

STYLE FOR THIS EMAIL:
${styleInstructions}

${GUARDRAILS}

Write TWO emails:
1. Initial outreach email
2. A short follow-up (assume no reply to email 1), sent ~4 days later — shorter than email 1,
   different angle or a simple bump, not a repeat of the same content.

Return ONLY valid JSON in this exact shape, nothing else, no markdown fences:
{"email1_subject":"...","email1_body":"...","email2_subject":"...","email2_body":"..."}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const d = await r.json();
    const text = d.content?.[0]?.text?.trim();
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('generateStyledEmail error:', e.message);
    return null;
  }
}

// ── Custom template mode ──
// Fully user-authored copy. No AI call — direct placeholder substitution. This is what
// lets Steve split-test his own hand-written message against AI-generated variants.

function fillTemplate(template, biz) {
  const owner = biz.owner_name || biz.email_owner || "";
  const firstName = owner.split(/\s+/)[0] || "there";
  const vars = {
    '{business_name}': biz.business_name || '',
    '{owner_name}': owner,
    '{owner_first_name}': firstName,
    '{city}': biz.city || '',
    '{category}': biz.category || '',
    '{rating}': biz.rating || '',
    '{review_count}': biz.review_count || '',
  };
  let filled = template;
  for (const [key, val] of Object.entries(vars)) {
    filled = filled.split(key).join(val);
  }
  return filled;
}

// ── Variant generation ──
// Generates N labeled variants per prospect so Steve can compare and pick, or load
// multiple into Smartlead as an A/B test.

async function generateVariants(biz, variantConfigs) {
  const results = [];
  for (const cfg of variantConfigs) {
    const label = cfg.label || cfg.style || 'variant';

    if (cfg.mode === 'custom_template') {
      if (!cfg.template) continue;
      results.push({
        variant_label: label,
        mode: 'custom_template',
        email1_subject: fillTemplate(cfg.subject1 || '', biz),
        email1_body: fillTemplate(cfg.template, biz),
        email2_subject: cfg.subject2 ? fillTemplate(cfg.subject2, biz) : null,
        email2_body: cfg.template2 ? fillTemplate(cfg.template2, biz) : null,
      });
      continue;
    }

    // AI-generated styled variant
    const styleKey = cfg.style || DEFAULT_STYLE;
    const generated = await generateStyledEmail(biz, styleKey, cfg.custom_prompt);
    if (generated) {
      results.push({
        variant_label: label,
        mode: 'ai_styled',
        style: styleKey,
        email1_subject: generated.email1_subject,
        email1_body: generated.email1_body,
        email2_subject: generated.email2_subject,
        email2_body: generated.email2_body,
      });
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { businesses, variants } = req.body;
  if (!businesses || !Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses array required' });
  }
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  // variants: array of variant configs, e.g.
  // [{ label: "A - Hormozi", style: "hormozi" }, { label: "B - My Message", mode: "custom_template", template: "Hey {owner_first_name}, ..." }]
  // Defaults to a single consultative-style variant if none provided (backward compatible).
  const variantConfigs = (variants && Array.isArray(variants) && variants.length > 0)
    ? variants
    : [{ label: DEFAULT_STYLE, style: DEFAULT_STYLE }];

  const loadable = businesses.filter(b => b.loadable && b.email);

  try {
    const results = [];
    for (const biz of loadable) {
      const bizVariants = await generateVariants(biz, variantConfigs);
      results.push({
        ...biz,
        outreach_variants: bizVariants,
      });
    }

    return res.status(200).json({
      total: businesses.length,
      loadable_count: loadable.length,
      variants_per_prospect: variantConfigs.length,
      variant_labels: variantConfigs.map(v => v.label || v.style || 'variant'),
      results,
    });
  } catch (err) {
    console.error('Outreach handler error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
