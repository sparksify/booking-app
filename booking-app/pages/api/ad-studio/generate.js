import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { AD_STYLES } from '@/lib/adStyles';

export const config = { maxDuration: 290 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const GUARDRAILS = `
Compliance guardrails (Meta ad policies):
- No income guarantees or specific earnings claims presented as typical.
- No "get rich quick" framing; frame as business ownership opportunity.
- No personal attributes callouts ("Are you broke?", "Tired of being 45 and stuck?").
- Truthful, substantiable claims only. CTA must match a lead-form flow.`;

function buildPrompt({ brief, style, variants, docsContext, inspirationContext }) {
  return `You are a direct-response copywriter creating Facebook Lead Ads for the franchise consulting industry.

${style.prompt}

CAMPAIGN BRIEF
Brand: ${brief.brand || 'N/A'}
Objective / goals: ${brief.objective || 'Generate qualified franchise-candidate leads'}
Offer: ${brief.offer || 'N/A'}
Target audience: ${brief.audience || 'Aspiring business owners with investable capital'}
Details: ${brief.brief || 'N/A'}
${docsContext ? `\nREFERENCE DOCUMENTS (ground your copy in these):\n${docsContext}` : ''}
${inspirationContext ? `\nINSPIRATION — active ads currently running in this industry (learn from angles, do not copy):\n${inspirationContext}` : ''}
${GUARDRAILS}

Generate exactly ${variants} distinct ad variants in this style. Each variant needs:
- headline: Facebook headline, max 40 chars
- primary_text: the main ad copy (125-500 chars, line breaks allowed)
- description: link description, max 30 chars
- cta: one of LEARN_MORE, SIGN_UP, APPLY_NOW, GET_QUOTE, CONTACT_US
- lead_form_subject: the lead form's intro headline (max 60 chars)
- lead_form_greeting: 1-2 sentence lead form intro paragraph
- image_prompt: a detailed prompt for an AI image generator describing the ad image (scene, subject, mood, style; no text overlays; photorealistic unless the style calls for bold graphic)

Return ONLY a valid JSON array of ${variants} objects with exactly those keys. No markdown fences, no commentary.`;
}

async function callClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const text = d.content?.[0]?.text?.trim() || '';
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });

  const { name, brand, objective, offer, audience, brief, styles, variantsPerStyle, docIds, libraryIds } = req.body || {};
  const styleKeys = (styles || []).filter((s) => AD_STYLES[s]);
  if (!styleKeys.length) return res.status(400).json({ error: 'Pick at least one style' });
  const variants = Math.min(Math.max(parseInt(variantsPerStyle) || 3, 1), 5);

  const supabase = getSupabaseAdmin();

  // Gather context from reference docs + inspiration ads
  let docsContext = '';
  if (docIds?.length) {
    const { data: docs } = await supabase
      .from('ad_reference_docs').select('filename, extracted_text').in('id', docIds);
    docsContext = (docs || [])
      .filter((d) => d.extracted_text)
      .map((d) => `--- ${d.filename} ---\n${d.extracted_text.slice(0, 8000)}`)
      .join('\n\n');
  }
  let inspirationContext = '';
  if (libraryIds?.length) {
    const { data: ads } = await supabase
      .from('ad_library').select('advertiser, headline, body').in('id', libraryIds);
    inspirationContext = (ads || [])
      .map((a) => `[${a.advertiser || 'Unknown'}] ${a.headline || ''}\n${(a.body || '').slice(0, 600)}`)
      .join('\n---\n');
  }

  const { data: briefRow, error: briefErr } = await supabase
    .from('ad_briefs')
    .insert({
      name: name || `Brief ${new Date().toISOString().slice(0, 10)}`,
      brand, objective, offer, audience, brief,
      styles: styleKeys,
      variants_per_style: variants,
      doc_ids: docIds || [],
      library_ids: libraryIds || [],
      created_by: session.user?.email || null,
    })
    .select()
    .single();
  if (briefErr) return res.status(500).json({ error: briefErr.message });

  // Generate all styles in parallel
  const results = await Promise.allSettled(
    styleKeys.map(async (key) => {
      const ads = await callClaude(buildPrompt({
        brief: { brand, objective, offer, audience, brief },
        style: AD_STYLES[key],
        variants,
        docsContext,
        inspirationContext,
      }));
      return ads.map((a) => ({
        brief_id: briefRow.id,
        style: key,
        headline: a.headline,
        primary_text: a.primary_text,
        description: a.description,
        cta: a.cta,
        lead_form_subject: a.lead_form_subject,
        lead_form_greeting: a.lead_form_greeting,
        image_prompt: a.image_prompt,
      }));
    })
  );

  const rows = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  const failures = results
    .map((r, i) => (r.status === 'rejected' ? `${styleKeys[i]}: ${r.reason?.message}` : null))
    .filter(Boolean);
  if (!rows.length) return res.status(502).json({ error: `Generation failed — ${failures.join('; ')}` });

  const { data: saved, error: saveErr } = await supabase.from('ad_generations').insert(rows).select();
  if (saveErr) return res.status(500).json({ error: saveErr.message });

  return res.json({ brief: briefRow, generations: saved, failures });
}
