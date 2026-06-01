const FB_API = 'https://graph.facebook.com/v19.0';

// Field name aliases — Facebook form field names vary by advertiser
const FIELD_ALIASES = {
  first_name:       ['first_name', 'firstName', 'fname'],
  last_name:        ['last_name',  'lastName',  'lname'],
  email:            ['email', 'email_address'],
  phone:            ['phone_number', 'phone', 'mobile', 'cell'],
  investment_level: ['investment_level', 'investment', 'budget_range', 'budget', 'investment_range'],
  territory:        ['what_area_or_territory_are_you_most_interested_in', 'area_or_territory', 'territory', 'area_of_interest', 'area_interest', 'interested_area'],
};

/**
 * Fetch full lead data from Facebook Graph API.
 * Requires FB_PAGE_ACCESS_TOKEN env var.
 */
export async function getLeadData(leadId) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('FB_PAGE_ACCESS_TOKEN not set');

  const url = `${FB_API}/${leadId}?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id&access_token=${token}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Parse Facebook's field_data array into a flat object.
 *
 * field_data looks like:
 *   [{ name: 'first_name', values: ['John'] }, { name: 'email', values: ['j@x.com'] }]
 *
 * Returns:
 *   {
 *     firstName, lastName, email, phone, investmentLevel,
 *     raw: { [fieldName]: value }   ← every field the lead answered
 *   }
 */
export function parseLeadFields(fieldData = []) {
  // Build a raw map: fieldName → first value
  const raw = {};
  for (const f of fieldData) {
    raw[f.name] = f.values?.[0] ?? '';
  }

  // Resolve aliases → canonical field
  function resolve(aliases) {
    for (const alias of aliases) {
      if (raw[alias] !== undefined && raw[alias] !== '') return raw[alias];
    }
    return '';
  }

  return {
    firstName:       resolve(FIELD_ALIASES.first_name),
    lastName:        resolve(FIELD_ALIASES.last_name),
    email:           resolve(FIELD_ALIASES.email),
    phone:           resolve(FIELD_ALIASES.phone),
    investmentLevel: resolve(FIELD_ALIASES.investment_level),
    territory:       resolve(FIELD_ALIASES.territory),
    raw,
  };
}

/**
 * Generate a short random token (8 chars, URL-safe).
 */
export function generateToken() {
  return Math.random().toString(36).slice(2, 6) +
         Math.random().toString(36).slice(2, 6);
}
