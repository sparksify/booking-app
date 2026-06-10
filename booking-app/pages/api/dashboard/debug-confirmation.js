/**
 * GET /api/dashboard/debug-confirmation?email=<client email>
 *
 * Diagnostic only. Returns the raw GHL conversation messages for a contact —
 * direction, type, date, and a body preview — so we can see exactly what the
 * confirmation analyzer is reading. Requires a logged-in dashboard session.
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return res.status(500).json({ error: 'GHL not configured' });

  const email = (req.query.email || '').toString().trim();
  if (!email) return res.status(400).json({ error: 'email query param required' });

  const headers = { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION };

  try {
    const cr = await fetch(`${GHL_API}/contacts/?locationId=${locationId}&query=${encodeURIComponent(email)}`, { headers });
    const cd = await cr.json();
    const contact = cd?.contacts?.[0];
    if (!contact) return res.json({ step: 'contact', error: 'contact not found', email });

    const sr = await fetch(`${GHL_API}/conversations/search?locationId=${locationId}&contactId=${contact.id}&limit=5`, { headers });
    const sd = await sr.json();
    const conv = sd?.conversations?.[0];
    if (!conv) return res.json({ step: 'conversation', error: 'no conversation', contactId: contact.id });

    const mr = await fetch(`${GHL_API}/conversations/${conv.id}/messages?limit=50`, { headers });
    const mStatus = mr.status;
    const md = await mr.json().catch(() => null);
    const list = md?.messages?.messages ?? md?.messages ?? [];

    const messages = (Array.isArray(list) ? list : []).map(m => ({
      direction: m.direction,
      type:      m.messageType || m.type,
      date:      m.dateAdded || m.createdAt,
      body:      (m.body || m.text || '').slice(0, 220),
    }));

    return res.json({
      contactId:      contact.id,
      conversationId: conv.id,
      messagesStatus: mStatus,
      count:          messages.length,
      inboundCount:   messages.filter(m => m.direction === 'inbound').length,
      messages,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
