export default async function handler(req, res) {
  const key = process.env.ANYMAIL_FINDER_API_KEY;
  if (!key) return res.status(200).json({ status: 'MISSING' });
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': key },
      body: JSON.stringify({ full_name: 'David Uygur', domain: 'luciadallas.com' }),
    });
    const d = await r.json();
    return res.status(200).json({ key_prefix: key.slice(0,6), api_response: d });
  } catch(err) {
    return res.status(200).json({ error: err.message });
  }
}
