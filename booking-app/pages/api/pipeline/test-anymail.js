export default async function handler(req, res) {
  const key = process.env.ANYMAIL_FINDER_API_KEY;
  if (!key) return res.status(200).json({ status: 'MISSING - key not found in env' });
  
  // Test one real search
  try {
    const r = await fetch('https://api.anymailfinder.com/v5.0/search/person.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, first_name: 'David', last_name: 'Uygur', domain: 'luciadallas.com' }),
    });
    const d = await r.json();
    return res.status(200).json({ key_present: true, key_prefix: key.slice(0,6), api_response: d });
  } catch(err) {
    return res.status(200).json({ key_present: true, error: err.message });
  }
}
