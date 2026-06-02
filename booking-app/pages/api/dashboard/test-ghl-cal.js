import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

/**
 * GET /api/dashboard/test-ghl-cal
 * Debug endpoint — returns raw GHL calendar events response.
 * Remove after confirming GHL integration is working.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const calendarId = process.env.GHL_CALENDAR_ID || 'Zd3fg5KnNbH5FEIHhq8R';

  if (!apiKey)     return res.json({ error: 'GHL_API_KEY not set' });
  if (!locationId) return res.json({ error: 'GHL_LOCATION_ID not set' });

  // Look at the last 7 days + next 14 days
  const now  = new Date();
  const from = new Date(now); from.setDate(from.getDate() - 7);
  const to   = new Date(now); to.setDate(to.getDate() + 14);

  const params = new URLSearchParams({
    locationId,
    calendarId,
    startTime: String(from.getTime()),
    endTime:   String(to.getTime()),
  });

  const url = `${GHL_API}/calendars/events?${params}`;

  let status, body;
  try {
    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'Version':       GHL_VERSION,
      },
    });
    status = r.status;
    body   = await r.json().catch(() => r.text());
  } catch (e) {
    return res.json({ error: e.message });
  }

  res.json({
    debug: {
      url,
      locationId,
      calendarId,
      startTime: from.toISOString(),
      endTime:   to.toISOString(),
    },
    status,
    body,
  });
}
