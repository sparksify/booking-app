import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('ad_reference_docs')
      .select('id, filename, mime_type, created_at, uploaded_by, extracted_text')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ docs: data });
  }

  if (req.method === 'POST') {
    const { filename, mimeType, contentBase64, text } = req.body || {};
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
      if (!extractedText && TEXT_TYPES.includes(mimeType)) {
        extractedText = buf.toString('utf8').slice(0, 100000);
      }
    }

    const { data, error } = await supabase
      .from('ad_reference_docs')
      .insert({
        filename,
        mime_type: mimeType || null,
        storage_path: storagePath,
        extracted_text: extractedText,
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
