export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

  const ANYMAIL_KEY = process.env.ANYMAIL_FINDER_API_KEY;
  if (!ANYMAIL_KEY) return res.status(500).json({ error: 'Missing ANYMAIL_FINDER_API_KEY' });

  const results = [];

  for (const biz of businesses) {
    const { owner_name, domain, business_name } = biz;

    if (!domain) {
      results.push({ ...biz, email: null, email_status: 'no_domain', enriched: false });
      continue;
    }

    let email = null;
    let emailStatus = 'not_found';

    if (owner_name) {
      const nameParts = owner_name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      if (firstName && lastName) {
        try {
          const r = await fetch('https://api.anymailfinder.com/v5.0/search/person.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: ANYMAIL_KEY, first_name: firstName, last_name: lastName, domain }),
          });
          const d = await r.json();
          if (d.email && d.result_status !== 'not_found') {
            email = d.email;
            emailStatus = d.result_status || 'found';
          }
        } catch (err) {
          console.error(`Person search failed for ${business_name}:`, err.message);
        }
      }
    }

    if (!email) {
      try {
        const r = await fetch('https://api.anymailfinder.com/v5.0/search/company.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: ANYMAIL_KEY, domain }),
        });
        const d = await r.json();
        if (d.emails && d.emails.length > 0) {
          const priority = d.emails.find(e =>
            ['owner','founder','ceo','president','director'].some(t => (e.position||'').toLowerCase().includes(t))
          );
          const picked = priority || d.emails[0];
          email = picked.email;
          emailStatus = picked.result_status || 'domain_found';
        }
      } catch (err) {
        console.error(`Domain search failed for ${business_name}:`, err.message);
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
