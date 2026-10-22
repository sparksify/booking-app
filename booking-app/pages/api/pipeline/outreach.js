export const config = { maxDuration: 300 };

import { DEFAULT_STYLE_INSTRUCTIONS, draftSequence } from '@/lib/pipeline/icebreaker';
import { requirePipelineAccess } from '@/lib/scout/auth';

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID;

function getFirstName(fullName) {
  if (!fullName) return null;
  return fullName.trim().split(' ')[0];
}

async function addLeadToSmartlead(biz, sequence) {
  const { email, email_owner, business_name } = biz;
  const firstName = getFirstName(email_owner) || 'there';
  const lastName = email_owner ? email_owner.trim().split(' ').slice(1).join(' ') : '';

  const response = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SMARTLEAD_CAMPAIGN_ID}/leads?api_key=${SMARTLEAD_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_list: [{
          email,
          first_name: firstName,
          last_name: lastName,
          company_name: business_name,
          custom_fields: {
            email1_subject: sequence.email1.subject,
            email1_body:    sequence.email1.body,
            email2_subject: sequence.email2.subject,
            email2_body:    sequence.email2.body,
          },
        }],
      }),
    }
  );
  return response.ok;
}

async function isDuplicate(email) {
  try {
    const response = await fetch(
      `https://server.smartlead.ai/api/v1/leads?api_key=${SMARTLEAD_API_KEY}&email=${encodeURIComponent(email)}`
    );
    const payload = await response.json();
    return Array.isArray(payload) && payload.length > 0;
  } catch {
    return false;
  }
}

export async function outreachOne(biz, styleInstructions = DEFAULT_STYLE_INSTRUCTIONS) {
  const { email } = biz;
  if (!email) return { ...biz, outreach_status: 'skipped_no_email' };
  const duplicate = await isDuplicate(email);
  if (duplicate) return { ...biz, outreach_status: 'skipped_duplicate' };
  let sequence;
  try {
    sequence = await draftSequence(biz, styleInstructions);
  } catch (error) {
    return { ...biz, outreach_status: 'failed_sequence_write', error: error.message };
  }
  const loaded = await addLeadToSmartlead(biz, sequence);
  return { ...biz, outreach_status: loaded ? 'loaded' : 'failed_smartlead', sequence };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requirePipelineAccess(req, res)) return;
  const { businesses, style_instructions: styleInstructionsInput } = req.body || {};
  if (!businesses || !Array.isArray(businesses)) return res.status(400).json({ error: 'businesses array required' });
  if (!SMARTLEAD_API_KEY || !SMARTLEAD_CAMPAIGN_ID) return res.status(500).json({ error: 'Missing Smartlead config' });

  const styleInstructions = (styleInstructionsInput && styleInstructionsInput.trim().length > 0)
    ? styleInstructionsInput.trim()
    : DEFAULT_STYLE_INSTRUCTIONS;

  try {
    const results = await Promise.all(businesses.map(biz => outreachOne(biz, styleInstructions)));
    const loaded  = results.filter(result => result.outreach_status === 'loaded');
    const skipped = results.filter(result => result.outreach_status?.startsWith('skipped'));
    const failed  = results.filter(result => result.outreach_status?.startsWith('failed'));
    return res.status(200).json({ total: results.length, loaded: loaded.length, skipped: skipped.length, failed: failed.length, results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
