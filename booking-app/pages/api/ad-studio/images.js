import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

export const config = { maxDuration: 290 };

const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Generate an ad image for a generation row via OpenAI gpt-image-1,
// store it in the ad-studio bucket, and save the public URL.
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();
  if (!OPENAI_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

  const { generationId, prompt: overridePrompt, size } = req.body || {};
  if (!generationId) return res.status(400).json({ error: 'generationId required' });

  const supabase = getSupabaseAdmin();
  const { data: gen, error: genErr } = await supabase
    .from('ad_generations').select('id, image_prompt').eq('id', generationId).single();
  if (genErr || !gen) return res.status(404).json({ error: 'Generation not found' });

  const prompt = overridePrompt || gen.image_prompt;
  if (!prompt) return res.status(400).json({ error: 'No image prompt on this ad' });

  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: `Facebook ad image, no text or words in the image. ${prompt}`,
      size: size || '1536x1024',
      quality: 'high',
      n: 1,
    }),
  });
  const d = await r.json();
  if (d.error) return res.status(502).json({ error: `OpenAI: ${d.error.message}` });

  const b64 = d.data?.[0]?.b64_json;
  if (!b64) return res.status(502).json({ error: 'OpenAI returned no image' });
  const buf = Buffer.from(b64, 'base64');

  const path = `images/${generationId}-${Date.now()}.png`;
  const { error: upErr } = await supabase.storage
    .from('ad-studio').upload(path, buf, { contentType: 'image/png', upsert: true });
  if (upErr) return res.status(500).json({ error: upErr.message });

  const { data: pub } = supabase.storage.from('ad-studio').getPublicUrl(path);
  const imageUrl = pub?.publicUrl || null;

  const { error: updErr } = await supabase
    .from('ad_generations')
    .update({ image_path: path, image_url: imageUrl, image_prompt: prompt })
    .eq('id', generationId);
  if (updErr) return res.status(500).json({ error: updErr.message });

  return res.json({ imageUrl, path });
}
