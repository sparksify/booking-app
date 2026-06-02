import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

// Hardcoded field ID → display label (avoids a round-trip to /customFields on every open)
const FIELD_LABELS = {
  'MquK4nPLhrQTUbvnHzTZ': 'Liquid Cash',
  '40JagvBXAiZeP1Ieepol': 'Cash Available',
  '8IgXZe8VaBoe9GgBL04o': 'Net Worth',
  'MgabbXjW1cLfQjLrKx1q': 'Areas of Interest',
  'B7NeRcBi2lnrgxWOHXf5': 'Territory Interest',
  'IfVyBdzB0t5YnH8EVSMG': 'Owned Business',
  '6caP9BDnlfEqm50L8yLW': 'Goal Timeline',
  'Kyf26uO9Q2i36OXDCyrd': 'Start Timeline',
  'R3Ywbqhk9zN4NyYUtMNh': 'Franchise Brand',
  '975l31anpDxXfsRQpokj': 'Brand Name',
  '4IPhi5dOGfUHAZV6sE2D': 'Franchise Name',
  'biKHwVPEjJtY4o2ae801': 'Video Views',
  'LdOhcPke8nNnyf5bhdbl': 'Video Plays',
  'vLZl3Hf1mLICX5B1eaxf': 'Watch Point %',
  'dw6XzIddxj7N5rkaUWUQ': 'Last Video Visit',
  'VAwjSEO7v5m5iE5BuRwy': 'Franchise Summary',
  'm6fsfbgYr7T6AiGNBK6d': 'Franchise Investment',
  'CjFAaTQxvkIWkDnJjPXz': 'Franchise Hook',
};

/**
 * GET /api/dashboard/ghl-contact-detail?contactId=xxx
 *
 * Returns enriched GHL contact data for the CRM side panel:
 * - Standard contact fields (name, email, phone, address)
 * - Custom fields mapped to human-readable labels
 * - Area code extracted from phone for territory lookup
 * - Tags
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { contactId, email } = req.query;
  if (!contactId && !email) return res.status(400).json({ error: 'contactId or email required' });

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.json({ contact: null });

  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION };

  let contact;
  try {
    if (contactId) {
      // Direct lookup by contact ID
      const r = await fetch(`${GHL_API}/contacts/${contactId}`, { headers });
      if (!r.ok) return res.json({ contact: null });
      const d = await r.json();
      contact = d.contact;
    } else {
      // Lookup by email — search contacts
      const locationId = process.env.GHL_LOCATION_ID;
      if (!locationId) return res.json({ contact: null });
      const params = new URLSearchParams({ locationId, email });
      const r = await fetch(`${GHL_API}/contacts/?${params}`, { headers });
      if (!r.ok) return res.json({ contact: null });
      const d = await r.json();
      // contacts array — take first match
      const match = (d.contacts || [])[0];
      if (!match) return res.json({ contact: null });
      // Fetch full contact record to get customFields + tags
      const r2 = await fetch(`${GHL_API}/contacts/${match.id}`, { headers });
      if (!r2.ok) return res.json({ contact: null });
      const d2 = await r2.json();
      contact = d2.contact;
    }
  } catch {
    return res.json({ contact: null });
  }

  if (!contact) return res.json({ contact: null });

  // Map custom fields using hardcoded labels — skip blank values
  const customFields = {};
  (contact.customFields || []).forEach(cf => {
    const label = FIELD_LABELS[cf.id];
    if (label && cf.value !== null && cf.value !== undefined && cf.value !== '') {
      customFields[label] = cf.value;
    }
  });

  // Extract 3-digit area code from phone
  const rawPhone = (contact.phone || '').replace(/\D/g, '');
  const digits   = rawPhone.startsWith('1') ? rawPhone.slice(1) : rawPhone;
  const areaCode = digits.length >= 3 ? digits.slice(0, 3) : null;

  res.json({
    contact: {
      id:            contact.id,
      first_name:    contact.firstName  || '',
      last_name:     contact.lastName   || '',
      email:         contact.email      || '',
      phone:         contact.phone      || '',
      tags:          contact.tags       || [],
      city:          contact.city       || null,
      state:         contact.state      || null,
      zip:           contact.postalCode || null,
      area_code:     areaCode,
      source:        contact.source     || null,
      date_added:    contact.dateAdded  || null,
      custom_fields: customFields,
    },
  });
}
