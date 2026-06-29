export const config = { maxDuration: 60 };

const FULLENRICH_KEY = process.env.FULLENRICH_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { owner_name, domain, business_name } = req.body;
  if (!owner_name || !domain) return res.status(400).json({ error: 'owner_name and domain required' });
  if (!FULLENRICH_KEY) return res.status(500).json({ error: 'Missing FULLENRICH_API_KEY' });

  const parts = owner_name.trim().split(/\s+/);
  if (parts.length < 2) return res.status(400).json({ error: 'Need full name (first + last) to find mobile' });

  const firstName = parts[0];
  const lastName  = parts.slice(1).join(' ');

  try {
    // POST enrichment job
    const postRes = await fetch('https://app.fullenrich.com/api/v2/contact/enrich/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FULLENRICH_KEY}`,
      },
      body: JSON.stringify({
        name: `Mobile: ${firstName} ${lastName} @ ${domain}`,
        data: [{
          first_name:    firstName,
          last_name:     lastName,
          domain,
          enrich_fields: ['contact.phones'],
        }],
      }),
    });

    const postData = await postRes.json();
    const enrichmentId = postData.enrichment_id;
    if (!enrichmentId) return res.status(200).json({ phone: null, reason: 'no_enrichment_id' });

    // Poll up to 15 times, 3s apart (45s max)
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const getRes = await fetch(
        `https://app.fullenrich.com/api/v2/contact/enrich/bulk/${enrichmentId}`,
        { headers: { 'Authorization': `Bearer ${FULLENRICH_KEY}` } }
      );
      const getData = await getRes.json();

      if (getData.status === 'FINISHED') {
        const phone = getData.data?.[0]?.contact_info?.most_probable_phone?.number;
        return res.status(200).json({ phone: phone || null, found: !!phone });
      }
      if (['CANCELED', 'CREDITS_INSUFFICIENT'].includes(getData.status)) {
        return res.status(200).json({ phone: null, reason: getData.status });
      }
    }

    return res.status(200).json({ phone: null, reason: 'timeout' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
