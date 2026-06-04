/**
 * GET /api/dashboard/imessage-history?address=+1XXXXXXXXXX
 *
 * Fetch iMessage conversation history for a phone number or email.
 * Used by the CRM panel iMessage tab in bookings.js.
 *
 * Returns an array of message objects:
 *   { guid, text, isFromMe, dateCreated, handle }
 *
 * Requires an active dashboard session.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getMessages } from '@/lib/bluebubbles';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { address, limit = '50' } = req.query;
  if (!address) return res.status(400).json({ error: 'address is required' });

  try {
    const messages = await getMessages(address, parseInt(limit, 10));

    // Normalize to a stable shape regardless of BB version
    const normalized = messages.map(m => ({
      guid:        m.guid || m.id || '',
      text:        m.text || m.body || '',
      isFromMe:    !!m.isFromMe,
      dateCreated: m.dateCreated || m.date_created || m.date || null,
      handle:      m.handle?.address || m.handleId || address,
    }));

    return res.json({ messages: normalized });
  } catch (err) {
    console.error('[imessage-history]', err.message);
    // Return empty rather than erroring — BB may not be configured yet
    if (err.message.includes('not configured')) {
      return res.json({ messages: [], error: 'not_configured' });
    }
    return res.json({ messages: [], error: err.message });
  }
}
