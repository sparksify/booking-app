import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

/**
 * GET /api/dashboard/nurture-conversation?contactId={id}
 *
 * Finds the GHL conversation for a contact, fetches all messages,
 * and returns them in normalized form for the inline chat panel.
 *
 * Returns: {
 *   conversationId: string | null,
 *   messages: Array<{
 *     id:        string,
 *     direction: 'inbound' | 'outbound',
 *     type:      'sms' | 'email' | 'call' | 'other',
 *     body:      string,
 *     subject:   string | null,
 *     dateAdded: string (ISO),
 *     status:    string,
 *   }>
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { contactId } = req.query;
  if (!contactId) return res.status(400).json({ error: 'contactId required' });

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey) {
    return res.json({ conversationId: null, messages: [] });
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': GHL_VERSION,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Search for conversation by contactId
    const searchUrl = `${GHL_API}/conversations/search?contactId=${contactId}${locationId ? `&locationId=${locationId}` : ''}&limit=1`;
    const searchRes = await fetch(searchUrl, { headers });

    if (!searchRes.ok) {
      const err = await searchRes.text().catch(() => searchRes.statusText);
      console.error('[nurture-conversation] search error', searchRes.status, err);
      return res.json({ conversationId: null, messages: [] });
    }

    const searchData = await searchRes.json();
    // GHL returns { conversations: [...] } or { data: { conversations: [...] } }
    const conversations =
      searchData.conversations ||
      searchData?.data?.conversations ||
      [];

    if (!conversations.length) {
      return res.json({ conversationId: null, messages: [] });
    }

    const conversationId = conversations[0].id;

    // 2. Fetch messages for this conversation
    const msgsRes = await fetch(
      `${GHL_API}/conversations/${conversationId}/messages?limit=100`,
      { headers }
    );

    if (!msgsRes.ok) {
      const err = await msgsRes.text().catch(() => msgsRes.statusText);
      console.error('[nurture-conversation] messages error', msgsRes.status, err);
      return res.json({ conversationId, messages: [] });
    }

    const msgsData = await msgsRes.json();
    // GHL returns { messages: { messages: [...] } } or { messages: [...] }
    const raw =
      msgsData?.messages?.messages ||
      msgsData?.messages ||
      [];

    // 3. Normalize messages
    const messages = raw
      .map(m => ({
        id:        m.id || m.messageId || String(Math.random()),
        direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
        type:      normalizeType(m),
        body:      m.body || m.message || '',
        subject:   m.subject || null,
        dateAdded: m.dateAdded || m.createdAt || new Date().toISOString(),
        status:    m.status || '',
      }))
      // Sort oldest → newest
      .sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));

    return res.json({ conversationId, messages });
  } catch (e) {
    console.error('[nurture-conversation] exception', e);
    return res.json({ conversationId: null, messages: [] });
  }
}

/**
 * Normalize GHL message type to a simple string.
 * GHL sends numeric `type` (1=call, 2=SMS, 3=email) and/or
 * string `messageType` (TYPE_CALL, TYPE_SMS, TYPE_EMAIL).
 */
function normalizeType(m) {
  const mt = (m.messageType || '').toLowerCase();
  if (mt.includes('sms') || m.type === 2)   return 'sms';
  if (mt.includes('email') || m.type === 3) return 'email';
  if (mt.includes('call') || m.type === 1)  return 'call';
  return 'other';
}
