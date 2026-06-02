import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

/**
 * POST /api/dashboard/send-sms
 *
 * Send an SMS to a nurture client via GHL conversations API.
 * Falls back to a sms: deep-link if no API key or contactId.
 *
 * Body: {
 *   phone:      string  — recipient phone number (fallback)
 *   message:    string  — SMS body text
 *   contactId?: string  — GHL contact ID for conversation lookup
 * }
 *
 * Returns: { ok: true } | { ok: false, fallback: true, smsLink: string } | { ok: false, error: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { phone, message, contactId } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  const apiKey = process.env.GHL_API_KEY;

  // If no API key or no contactId, return a sms: deep-link for the client to open
  if (!apiKey || !contactId) {
    return res.json({
      ok: false,
      fallback: true,
      smsLink: `sms:${phone || ''}?body=${encodeURIComponent(message.trim())}`,
    });
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': GHL_VERSION,
    'Content-Type': 'application/json',
  };

  try {
    // GHL: send SMS via conversations messages endpoint
    const r = await fetch(`${GHL_API}/conversations/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type:      'SMS',
        contactId,
        message:   message.trim(),
      }),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => r.statusText);
      console.error('[send-sms] GHL error', r.status, err);
      // Fallback to sms: link
      return res.json({
        ok: false,
        fallback: true,
        smsLink: `sms:${phone || ''}?body=${encodeURIComponent(message.trim())}`,
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[send-sms] exception', e);
    return res.json({
      ok: false,
      fallback: true,
      smsLink: `sms:${phone || ''}?body=${encodeURIComponent(message.trim())}`,
    });
  }
}
