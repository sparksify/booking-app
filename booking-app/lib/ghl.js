const GHL_API = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

/**
 * Upsert a contact in GoHighLevel.
 * If a contact with the same email already exists, it will be updated.
 *
 * Required env vars:
 *   GHL_API_KEY       — Private Integration key (sub-account level)
 *   GHL_LOCATION_ID   — Sub-account Location ID
 *
 * @param {Object} params
 * @param {string} params.locationId
 * @param {string} [params.firstName]
 * @param {string} [params.lastName]
 * @param {string} [params.email]
 * @param {string} [params.phone]
 * @param {string[]} [params.tags]
 * @param {string} [params.source]
 * @param {Array<{key: string, field_value: string}>} [params.customFields]
 *
 * @returns {Promise<{id: string, ...} | null>}
 */
export async function upsertGHLContact({
  locationId,
  firstName,
  lastName,
  email,
  phone,
  tags = [],
  source = 'Facebook Lead Ad',
  customFields = [],
}) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) throw new Error('GHL_API_KEY not set');

  const body = {
    locationId,
    firstName:    firstName  || undefined,
    lastName:     lastName   || undefined,
    email:        email      || undefined,
    phone:        phone      || undefined,
    source,
    tags:         tags.filter(Boolean),
    customFields: customFields.filter(f => f.field_value),
  };

  const res = await fetch(`${GHL_API}/contacts/upsert`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL upsert failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.contact ?? null;
}

/**
 * Add tags to an existing GHL contact by ID.
 */
export async function addGHLTags(contactId, tags) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) throw new Error('GHL_API_KEY not set');

  const res = await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify({ tags }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL addTags failed ${res.status}: ${text}`);
  }
  return res.json();
}
