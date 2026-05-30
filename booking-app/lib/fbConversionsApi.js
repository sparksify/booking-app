/**
 * lib/fbConversionsApi.js
 *
 * Server-side Facebook Conversions API (CAPI) helper.
 * Sends conversion events directly from the server to Facebook,
 * bypassing ad blockers and iOS privacy restrictions.
 *
 * Required env vars:
 *   FB_PIXEL_ID     — your Pixel ID (same as NEXT_PUBLIC_FB_PIXEL_ID)
 *   FB_CAPI_TOKEN   — System User access token with ads_management permission
 *                     (generate in Business Manager → System Users)
 */

const PIXEL_ID   = process.env.FB_PIXEL_ID   || process.env.NEXT_PUBLIC_FB_PIXEL_ID || '';
const CAPI_TOKEN = process.env.FB_CAPI_TOKEN || '';
const API_VERSION = 'v19.0';

/**
 * Send one or more events to the Facebook Conversions API.
 *
 * @param {Array<object>} events  Array of CAPI event objects
 * @returns {object|null}         Facebook API response or null if not configured
 */
export async function sendCapiEvents(events) {
  if (!PIXEL_ID || !CAPI_TOKEN) return null;

  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: events,
        // test_event_code: 'TEST12345', // uncomment to test in Events Manager
      }),
    });

    const json = await res.json();
    if (!res.ok) console.error('[capi] error:', JSON.stringify(json));
    return json;
  } catch (err) {
    console.error('[capi] fetch error:', err.message);
    return null;
  }
}

/**
 * Build a CAPI event object.
 *
 * @param {string} eventName   - Facebook standard event name (e.g. 'Schedule')
 * @param {object} opts
 * @param {string} opts.email  - Lead email (will be hashed)
 * @param {string} opts.phone  - Lead phone (will be hashed)
 * @param {string} opts.sourceUrl - Page URL where action happened
 * @param {object} opts.customData - Extra data (value, currency, content_name, etc.)
 * @param {string} opts.eventId  - Dedup ID (match client-side event ID if possible)
 */
export function buildCapiEvent(eventName, { email, phone, sourceUrl, customData = {}, eventId } = {}) {
  const userData = {};

  if (email) {
    userData.em = hashSha256(email.trim().toLowerCase());
  }
  if (phone) {
    // Normalize: digits only, prepend country code if 10 digits
    const digits = phone.replace(/\D/g, '');
    userData.ph = hashSha256(digits.length === 10 ? `1${digits}` : digits);
  }

  return {
    event_name:       eventName,
    event_time:       Math.floor(Date.now() / 1000),
    event_id:         eventId || `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    event_source_url: sourceUrl || '',
    action_source:    'website',
    user_data:        userData,
    custom_data:      customData,
  };
}

// ─── SHA-256 hashing (required by CAPI for PII) ───────────────────────────────

async function hashSha256(str) {
  // Node.js crypto (server-side only)
  const { createHash } = await import('crypto');
  return createHash('sha256').update(str).digest('hex');
}
