export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

  const ANYMAIL_KEY = process.env.ANYMAIL_FINDER_API_KEY;
  if (!ANYMAIL_KEY) return res.status(500).json({ error: 'Missing ANYMAIL_FINDER_API_KEY' });

  const results = [];

  for (const biz of businesses) {
    const { owner_name, domain, business_name } = biz;

    if (!domain && !owner_name) {
      results.push({ ...biz, email: null, email_status: 'no_data', enriched: false });
      continue;
    }

    let email = null;
    let emailStatus = 'not_found';

    // Person search using full_name + domain
    if (owner_name && domain) {
      try {
        const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': ANYMAIL_KEY,
          },
          body: JSON.stringify({ full_name: owner_name, domain }),
        });
        const d = await r.json();
        if (d.email) {
          email = d.email;
          emailStatus = d.result_status || 'found';
        }
      } catch (err) {
        console.error(`Person search failed for ${business_name}:`, err.message);
      }
    }

    // Fallback: company name search
    if (!email && business_name) {
      try {
        const r = await fetch('https://api.anymailfinder.com/v5.1/find-email/person', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': ANYMAIL_KEY,
          },
          body: JSON.stringify({ full_name: owner_name || '', company_name: business_name }),
        });
        const d = await r.json();
        if (d.email) {
          email = d.email;
          emailStatus = d.result_status || 'company_found';
        }
      } catch (err) {
        console.error(`Company search failed for ${business_name}:`, err.message);
      }
    }

    results.push({ ...biz, email, email_status: emailStatus, enriched: !!email });
    await new Promise(r => setTimeout(r, 300));
  }

  const enriched = results.filter(r => r.enriched);
  return res.status(200).json({
    total: results.length,
    enriched_count: enriched.length,
    hit_rate: results.length > 0 ? Math.round((enriched.length / results.length) * 100) : 0,
    results,
  });
}
