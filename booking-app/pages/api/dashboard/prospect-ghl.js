import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

/**
 * GET /api/dashboard/prospect-ghl?contactId=xxx
 *  OR GET /api/dashboard/prospect-ghl?email=xxx@example.com
 *
 * Fetches GHL signals for a single lead, called lazily from the prospecting
 * queue when a rep opens a specific lead card. Returns recent inbound messages,
 * email opens, and last activity date so the rep sees live engagement data.
 *
 * Returns: { signals: Array<{ type, label, date }>, lastActivity: string|null }
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_KEY  = process.env.GHL_API_KEY;
const GHL_LOC_ID   = process.env.GHL_LOCATION_ID;
const GHL_HEADERS  = () => ({
  Authorization: `Bearer ${GHL_API_KEY}`,
  'Content-Type': 'application/json',
  Version: '2021-07-28',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { contactId: qContactId, email } = req.query;
  if (!qContactId && !email) {
    return res.status(400).json({ error: 'contactId or email required' });
  }

  if (!GHL_API_KEY || !GHL_LOC_ID) {
    return res.json({ signals: [], lastActivity: null, note: 'GHL not configured' });
  }

  try {
    // ── Resolve contact ID if we only have email ────────────────────────────
    let contactId = qContactId;
    if (!contactId && email) {
      const searchRes = await fetch(
        `${GHL_BASE}/contacts/?locationId=${GHL_LOC_ID}&query=${encodeURIComponent(email)}&limit=1`,
        { headers: GHL_HEADERS() }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        contactId = searchData.contacts?.[0]?.id || null;
      }
    }

    if (!contactId) return res.json({ signals: [], lastActivity: null });

    // ── Fetch conversations for this contact ────────────────────────────────
    const convRes = await fetch(
      `${GHL_BASE}/conversations/search?locationId=${GHL_LOC_ID}&contactId=${contactId}&limit=3`,
      { headers: GHL_HEADERS() }
    );
    if (!convRes.ok) return res.json({ signals: [], lastActivity: null });

    const convData  = await convRes.json();
    const convos    = convData.conversations || [];
    const signals   = [];
    let   lastActivity = null;

    // ── Walk recent messages for engagement signals ─────────────────────────
    for (const convo of convos.slice(0, 2)) {
      // Track last inbound activity date from conversation metadata
      if (convo.lastMessageDate) {
        const d = new Date(convo.lastMessageDate);
        if (!lastActivity || d > new Date(lastActivity)) lastActivity = convo.lastMessageDate;
      }

      // Fetch up to 8 recent messages from this conversation
      const msgRes = await fetch(
        `${GHL_BASE}/conversations/${convo.id}/messages?limit=8`,
        { headers: GHL_HEADERS() }
      );
      if (!msgRes.ok) continue;

      const msgData = await msgRes.json();
      const msgs    = msgData.messages?.messages || [];

      for (const msg of msgs) {
        const date = msg.dateAdded || msg.createdAt;

        // Inbound message = they reached out / replied
        if (msg.direction === 'inbound') {
          const label = msg.type === 'SMS'   ? 'Replied to SMS'
                      : msg.type === 'Email' ? 'Replied to email'
                      : 'Sent an inbound message';
          signals.push({ type: 'inbound_reply', label, date });
        }

        // Email open (GHL stores this in meta)
        if (msg.meta?.openedAt || msg.opened) {
          signals.push({ type: 'email_opened', label: 'Opened an email', date: msg.meta?.openedAt || date });
        }

        // Link click
        if (msg.meta?.clickedAt || msg.clicked) {
          signals.push({ type: 'link_clicked', label: 'Clicked a link in email/SMS', date: msg.meta?.clickedAt || date });
        }
      }
    }

    // De-dupe and sort by date descending, limit to 8 most recent signals
    const seen = new Set();
    const uniqueSignals = signals
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .filter(s => {
        const key = `${s.type}:${s.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);

    return res.json({ signals: uniqueSignals, lastActivity, contactId });

  } catch (err) {
    console.error('[prospect-ghl] Error:', err.message);
    return res.json({ signals: [], lastActivity: null, error: err.message });
  }
}
