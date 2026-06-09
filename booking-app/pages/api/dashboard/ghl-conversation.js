/**
 * GET /api/dashboard/ghl-conversation?contactId=...   (or ?email=...)
 *
 * Returns the contact's HighLevel conversation thread, normalized and sorted
 * oldest → newest for display in the CRM panel.
 *
 * Response: { messages: [{ id, direction, body, type, date }] }
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getGHLConversationMessages, lookupGHLContactByEmail } from '@/lib/ghl';

// Map GHL messageType / type to a short channel label.
function channelLabel(m) {
  const t = String(m.messageType || m.type || '').toUpperCase();
  if (t.includes('EMAIL'))     return 'Email';
  if (t.includes('CALL'))      return 'Call';
  if (t.includes('VOICEMAIL')) return 'Voicemail';
  if (t.includes('FACEBOOK'))  return 'Facebook';
  if (t.includes('INSTAGRAM')) return 'Instagram';
  if (t.includes('WHATSAPP'))  return 'WhatsApp';
  if (t.includes('LIVE_CHAT') || t.includes('CHAT')) return 'Chat';
  if (t.includes('GMB'))       return 'Google';
  if (t.includes('SMS'))       return 'SMS';
  return 'SMS';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  let contactId = (req.query.contactId || '').toString().trim();
  const email   = (req.query.email || '').toString().trim();

  if (!contactId && email) {
    const c = await lookupGHLContactByEmail(email).catch(() => null);
    contactId = c?.id || '';
  }
  if (!contactId) return res.json({ messages: [] });

  try {
    const raw = await getGHLConversationMessages(contactId, 100);
    const messages = raw
      .map(m => {
        const label = channelLabel(m);
        let body = m.body || m.text || '';
        // Email bodies often arrive as HTML — strip tags for a readable thread.
        if (body && /<[a-z][\s\S]*>/i.test(body)) {
          body = body.replace(/<style[\s\S]*?<\/style>/gi, ' ')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/&nbsp;/gi, ' ')
                     .replace(/&amp;/gi, '&')
                     .replace(/\s+/g, ' ')
                     .trim();
        }
        if (!body && label === 'Call') body = '📞 Call';
        if (!body && label === 'Voicemail') body = '🎙️ Voicemail';
        return {
          id:        m.id || m.messageId || `${m.dateAdded || ''}_${Math.random()}`,
          direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
          body,
          type:      label,
          date:      m.dateAdded || m.createdAt || m.dateUpdated || null,
        };
      })
      .filter(m => m.body)
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    return res.json({ messages });
  } catch (err) {
    console.error('[ghl-conversation]', err.message);
    return res.json({ messages: [], error: err.message });
  }
}
