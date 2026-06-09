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
 * Remove tags from an existing GHL contact by ID.
 */
export async function removeGHLTags(contactId, tags) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) throw new Error('GHL_API_KEY not set');

  const res = await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
    method:  'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify({ tags }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL removeTags failed ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Add a note to a GHL contact.
 */
export async function addGHLNote(contactId, body) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;

  const res = await fetch(`${GHL_API}/contacts/${contactId}/notes`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify({ userId: '', body, contactId }),
  });

  if (!res.ok) return null;
  return res.json();
}

/**
 * Update an existing note on a GHL contact. Returns the parsed response or null.
 */
export async function updateGHLNote(contactId, noteId, body) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !contactId || !noteId) return null;

  const res = await fetch(`${GHL_API}/contacts/${contactId}/notes/${noteId}`, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify({ userId: '', body, contactId }),
  });

  if (!res.ok) return null;
  return res.json();
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

/**
 * Look up a GHL contact by email.
 * Returns the first matching contact or null.
 */
export async function lookupGHLContactByEmail(email) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;

  const res = await fetch(
    `${GHL_API}/contacts/?locationId=${locationId}&query=${encodeURIComponent(email)}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version':       GHL_VERSION,
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.contacts?.[0] ?? null;
}

/**
 * Get the most recent open opportunity for a GHL contact.
 * Returns the opportunity object or null.
 */
export async function getGHLContactOpportunity(contactId) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;

  const res = await fetch(
    `${GHL_API}/opportunities/search?location_id=${locationId}&contact_id=${contactId}&limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version':       GHL_VERSION,
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.opportunities?.[0] ?? null;
}

/**
 * Create a new GHL opportunity linked to a contact.
 */
export async function createGHLOpportunity({ contactId, name, pipelineId, stageId }) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;

  const res = await fetch(`${GHL_API}/opportunities/`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify({
      locationId,
      contactId,
      name,
      pipelineId,
      stageId,
      status: 'open',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL createOpportunity failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.opportunity ?? null;
}

/**
 * Update a GHL opportunity's pipeline stage.
 *
 * Required env vars (paste your GHL pipeline stage IDs):
 *   GHL_STAGE_SHOWED      — stage ID for "Consultation Completed" / Showed
 *   GHL_STAGE_NO_SHOW     — stage ID for "No Show"
 *   GHL_STAGE_CLOSED_WON  — stage ID for "Closed Won"
 */
export async function updateGHLOpportunityStage(opportunityId, stageId) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !stageId) return null;

  const res = await fetch(`${GHL_API}/opportunities/${opportunityId}`, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify({ stageId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL updateOpportunity failed ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Resolve a GHL user id from an email address by scanning the location's users.
 * Used when reassigning a contact's owner during an appointment transfer.
 * Returns the user id string or null if not found.
 *
 * @param {string} email
 */
export async function getGHLUserIdByEmail(email) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId || !email) return null;

  const res = await fetch(`${GHL_API}/users/?locationId=${locationId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version':       GHL_VERSION,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const users = data.users || data || [];
  const want = String(email).trim().toLowerCase();
  const match = (Array.isArray(users) ? users : []).find(
    u => String(u.email || '').trim().toLowerCase() === want
  );
  return match?.id ?? null;
}

/**
 * Reassign the owner (assignedTo) of a GHL contact.
 *
 * @param {string} contactId
 * @param {string} assignedToUserId  GHL user id
 */
export async function updateGHLContactOwner(contactId, assignedToUserId) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !contactId || !assignedToUserId) return null;

  const res = await fetch(`${GHL_API}/contacts/${contactId}`, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify({ assignedTo: assignedToUserId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL updateContactOwner failed ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Update a GHL calendar appointment's status. This is what the meetings list
 * reads back (appointmentStatus), so it's required for a status change to
 * persist across refreshes for GHL-sourced bookings.
 *
 * @param {string} eventId            GHL appointment/event id (no `ghl_` prefix)
 * @param {string} appointmentStatus  one of: new | confirmed | cancelled | showed | noshow | invalid
 */
export async function updateGHLAppointmentStatus(eventId, appointmentStatus) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !eventId || !appointmentStatus) return null;

  const res = await fetch(`${GHL_API}/calendars/events/appointments/${eventId}`, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
    body: JSON.stringify({ appointmentStatus }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL updateAppointmentStatus failed ${res.status}: ${text}`);
  }
  return res.json();
}
