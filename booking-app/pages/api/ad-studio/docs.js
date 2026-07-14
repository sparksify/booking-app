import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } }, maxDuration: 290 };

const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function extractText(buf, mimeType, filename) {
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(filename)) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const result = await parser.getText();
      return (result.text || '').trim();
    } finally {
      await parser.destroy();
    }
  }
  if (TEXT_TYPES.includes(mimeType) || /\.(txt|md|csv|json)$/i.test(filename)) {
    return buf.toString('utf8');
  }
  return null;
}

// Distill the doc into stored brand knowledge, reusable for future campaigns.
async function summarizeDoc({ filename, brand, text }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are building a permanent brand-knowledge base for a franchise-consulting ad platform. Summarize this reference document so a copywriter could write on-brand Facebook ads months from now without re-reading the original.

Document: ${filename}${brand ? ` (brand: ${brand})` : ''}

Capture, in tight markdown sections (only include sections the document supports):
- **What the business/offer is** — one paragraph
- **Target customer** — who they are, what they want, objections
- **Key facts & numbers** — investment levels, revenue figures, differentiators, guarantees
- **Brand voice** — tone, phrases they use, phrases to avoid
- **Proof & credibility** — awards, testimonials, track record
- **Anything a copywriter must not get wrong** — compliance, claims to avoid

Be dense and factual. No preamble.

DOCUMENT CONTENT:
${text.slice(0, 60000)}`,
      }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text?.trim() || null;
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    let q = supabase
      .from('ad_reference_docs')
      .select('id, filename, mime_type, brand, created_at, uploaded_by, ai_summary, summary_status, extracted_text')
      .order('created_at', { ascending: false });
    if (req.query.brand) q = q.eq('brand', req.query.brand);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ docs: data });
  }

  if (req.method === 'POST') {
    // Re-summarize an existing doc on demand
    if (req.body?.action === 'summarize') {
      const { id } = req.body;
      const { data: doc } = await supabase.from('ad_reference_docs')
        .select('id, filename, brand, extracted_text').eq('id', id).single();
      if (!doc?.extracted_text) return res.status(400).json({ error: 'No extracted text to summarize' });
      try {
        const summary = await summarizeDoc({ filename: doc.filename, brand: doc.brand, text: doc.extracted_text });
        await supabase.from('ad_reference_docs')
          .update({ ai_summary: summary, summary_status: 'ready' }).eq('id', id);
        return res.json({ ok: true, summary });
      } catch (e) {
        await supabase.from('ad_reference_docs').update({ summary_status: 'failed' }).eq('id', id);
        return res.status(502).json({ error: `Summarization failed: ${e.message}` });
      }
    }

    const { filename, mimeType, contentBase64, text, brand } = req.body || {};
    if (!filename || (!contentBase64 && !text)) {
      return res.status(400).json({ error: 'filename and contentBase64 or text required' });
    }

    let storagePath = null;
    let extractedText = text || null;

    if (contentBase64) {
      const buf = Buffer.from(contentBase64, 'base64');
      storagePath = `docs/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('ad-studio')
        .upload(storagePath, buf, { contentType: mimeType || 'application/octet-stream' });
      if (upErr) return res.status(500).json({ error: upErr.message });
      if (!extractedText) {
        try {
          extractedText = (await extractText(buf, mimeType, filename))?.slice(0, 200000) || null;
        } catch (e) {
          console.error('extractText failed:', filename, e.message);
        }
      }
    }

    // Summarize into brand knowledge (best-effort — upload still succeeds if this fails)
    let aiSummary = null;
    let summaryStatus = 'skipped';
    if (extractedText && extractedText.length > 100 && ANTHROPIC_KEY) {
      try {
        aiSummary = await summarizeDoc({ filename, brand, text: extractedText });
        summaryStatus = 'ready';
      } catch (e) {
        console.error('summarizeDoc failed:', filename, e.message);
        summaryStatus = 'failed';
      }
    }

    const { data, error } = await supabase
      .from('ad_reference_docs')
      .insert({
        filename,
        mime_type: mimeType || null,
        storage_path: storagePath,
        extracted_text: extractedText,
        brand: brand || null,
        ai_summary: aiSummary,
        summary_status: summaryStatus,
        uploaded_by: session.user?.email || null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ doc: data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data: doc } = await supabase.from('ad_reference_docs').select('storage_path').eq('id', id).single();
    if (doc?.storage_path) await supabase.storage.from('ad-studio').remove([doc.storage_path]);
    const { error } = await supabase.from('ad_reference_docs').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
