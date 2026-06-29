import { getSupabaseAdmin } from '@/lib/supabase';

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID || '3562806';
const LANDING_PAGE_URL = process.env.LANDING_PAGE_URL || 'https://halloway.co/grow';

async function checkDuplicate(supabase, email, businessName, city) {
  if (email) {
    const { data } = await supabase.from('pipeline_prospects').select('id,business_name,city,created_at').eq('email', email).limit(1);
    if (data?.length > 0) return { isDuplicate: true, reason: `Email already in pipeline (added ${new Date(data[0].created_at).toLocaleDateString()})` };
  }
  const { data: nameCheck } = await supabase.from('pipeline_prospects').select('id,created_at').ilike('business_name', businessName).ilike('city', city).limit(1);
  if (nameCheck?.length > 0) return { isDuplicate: true, reason: `${businessName} in ${city} already in pipeline (${new Date(nameCheck[0].created_at).toLocaleDateString()})` };
  return { isDuplicate: false };
}

async function writeSequence(business) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      tools: [{
        name: 'submit_sequence',
        description: 'Submit the 4-email outreach sequence.',
        input_schema: {
          type: 'object',
          properties: {
            emails: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  subject: { type: 'string' },
                  body: { type: 'string' },
                  day: { type: 'number' },
                },
                required: ['subject', 'body', 'day'],
              }
            }
          },
          required: ['emails'],
        }
      }],
      tool_choice: { type: 'tool', name: 'submit_sequence' },
      messages: [{ role: 'user', content: `Write a 4-email cold outreach sequence from Steve Sparks at Halloway (halloway.co), a franchise consulting firm.\n\nTarget:\nBusiness: ${business.business_name}\nCity: ${business.city}\nIndustry: ${business.industry}\nOwner: ${business.owner_name || 'the owner'}\nSignals: ${(business.signals || []).join(', ')}\n\nRules:\n- Each email under 150 words\n- Sound like a real human, not a marketer\n- Reference something specific about this business\n- Never say: synergy, leverage, scalable, game-changer, reach out\n- Never pitch franchising directly - invite curiosity\n- Emails 2-4 include: ${LANDING_PAGE_URL}\n- Email 1 ends with one question, no link\n- Days: 0, 3, 7, 14\n\nCall submit_sequence now.` }],
    }),
  });
  const data = await res.json();
  const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_sequence');
  return toolUse?.input || null;
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
    email_body: (email.body || '').replace(/\n/g, '<br>'),
  }));
  const r = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SMARTLEAD_CAMPAIGN_ID}/sequences?api_key=${SMARTLEAD_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sequences: emailSequence }) }
  );
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { businesses, run_id } = req.body;
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });

  const supabase = getSupabaseAdmin();
  const eligible = businesses.filter(b => b.enriched && b.email);
  if (!eligible.length) return res.status(200).json({ message: 'No enriched businesses', loaded: 0, duplicates: 0, results: [] });

  const results = [];

  for (const biz of eligible) {
    try {
      const dupCheck = await checkDuplicate(supabase, biz.email, biz.business_name, biz.city);
      if (dupCheck.isDuplicate) {
        results.push({ business_name: biz.business_name, email: biz.email, status: 'duplicate', reason: dupCheck.reason, ownership_candidate: biz.ownership_candidate, emails_preview: [] });
        continue;
      }

      const sequence = await writeSequence(biz);
      const leadAdded = await addLeadToSmartlead(biz);
      let sequenceAdded = false;
      if (sequence) sequenceAdded = await addSequenceToSmartlead(sequence);
      const status = leadAdded ? 'loaded' : 'failed';

      if (run_id) {
        await supabase.from('pipeline_prospects').insert({
          run_id, business_name: biz.business_name, city: biz.city, industry: biz.industry,
          owner_name: biz.owner_name, email: biz.email, domain: biz.domain, website: biz.website,
          franchise_score: biz.franchise_score, ownership_score: biz.ownership_score, total_score: biz.total_score,
          ownership_candidate: biz.ownership_candidate, signals: biz.signals || [],
          enriched: biz.enriched, loaded: status === 'loaded', smartlead_status: status,
        });
      }

      results.push({
        business_name: biz.business_name, email: biz.email, ownership_candidate: biz.ownership_candidate,
        lead_added: leadAdded, sequence_written: !!sequence, sequence_loaded: sequenceAdded,
        emails_preview: sequence?.emails?.map(e => ({ subject: e.subject, day: e.day })) || [],
        status,
      });
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      results.push({ business_name: biz.business_name, email: biz.email, status: 'error', error: err.message });
    }
  }

  const loaded = results.filter(r => r.status === 'loaded').length;
  const duplicates = results.filter(r => r.status === 'duplicate').length;
  return res.status(200).json({ processed: eligible.length, loaded, duplicates, failed: eligible.length - loaded - duplicates, results });
}
