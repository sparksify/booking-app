const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID || '3562806';
const LANDING_PAGE_URL = process.env.LANDING_PAGE_URL || 'https://halloway.co/grow';

async function writeSequence(business) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const prompt = `You are writing a 4-email cold outreach sequence on behalf of Steve Sparks at Halloway (halloway.co), a franchise consulting firm.

Target business:
Business: ${business.business_name}
City: ${business.city}
Industry: ${business.industry}
Owner: ${business.owner_name || 'the owner'}
Key signals: ${(business.signals || []).join(', ')}
Website: ${business.website || 'not found'}

Steve helps successful independent business owners explore whether franchising their concept makes sense. He is not selling anything — just opening a conversation about what they have built.

Landing page: ${LANDING_PAGE_URL}

Rules:
- Each email under 150 words
- Sound like a real human, not a marketer
- Reference something SPECIFIC about this business
- Never use synergy, leverage, scalable, game-changer
- Never pitch franchising directly — invite curiosity
- Drive to landing page in emails 2-4
- Email 1 ends with one question, no link

Return ONLY valid JSON, no markdown:
{
  "emails": [
    { "subject": "subject", "body": "body with \\n for line breaks", "day": 0 },
    { "subject": "subject", "body": "body", "day": 3 },
    { "subject": "subject", "body": "body", "day": 7 },
    { "subject": "subject", "body": "body", "day": 14 }
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
  });

  const data = await response.json();
  const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch { return null; }
}

async function addLeadToSmartlead(business) {
  const nameParts = (business.owner_name || 'Business Owner').split(' ');
  const payload = {
    lead_list: [{
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(' ') || 'Owner',
      email: business.email,
      company_name: business.business_name,
      website: business.website || '',
      custom_fields: {
        city: business.city,
        industry: business.industry,
        franchise_score: String(business.franchise_score || ''),
        ownership_candidate: business.ownership_candidate ? 'Yes' : 'No',
        signals: (business.signals || []).join(' | '),
      },
    }],
  };
  const r = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SMARTLEAD_CAMPAIGN_ID}/leads?api_key=${SMARTLEAD_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
  return r.ok;
}

async function addSequenceToSmartlead(sequence) {
  if (!sequence?.emails?.length) return false;
  const emailSequence = sequence.emails.map((email, i) => ({
    seq_number: i + 1,
    seq_delay_details: { delay_in_days: email.day || 0 },
    subject: email.subject,
    email_body: email.body.replace(/\n/g, '<br>'),
  }));
  const r = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SMARTLEAD_CAMPAIGN_ID}/sequences?api_key=${SMARTLEAD_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sequences: emailSequence }) }
  );
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

  const eligible = businesses.filter(b => b.enriched && b.email);
  if (!eligible.length) return res.status(200).json({ message: 'No enriched businesses', loaded: 0 });

  const results = [];
  for (const biz of eligible) {
    try {
      const sequence = await writeSequence(biz);
      const leadAdded = await addLeadToSmartlead(biz);
      let sequenceAdded = false;
      if (sequence) sequenceAdded = await addSequenceToSmartlead(sequence);
      results.push({
        business_name: biz.business_name,
        email: biz.email,
        ownership_candidate: biz.ownership_candidate,
        lead_added: leadAdded,
        sequence_written: !!sequence,
        sequence_loaded: sequenceAdded,
        emails_preview: sequence?.emails?.map(e => ({ subject: e.subject, day: e.day })) || [],
        status: leadAdded ? 'loaded' : 'failed',
      });
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      results.push({ business_name: biz.business_name, email: biz.email, status: 'error', error: err.message });
    }
  }

  const loaded = results.filter(r => r.status === 'loaded').length;
  return res.status(200).json({ processed: eligible.length, loaded, failed: eligible.length - loaded, results });
}
