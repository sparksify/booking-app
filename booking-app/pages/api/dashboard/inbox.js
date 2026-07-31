import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getGHLUserIdByEmail } from '@/lib/ghl';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

/**
 * GET /api/dashboard/inbox
 *
 * The "needs my reply" inbox: conversations where the prospect messaged in
 * (lastMessageDirection=inbound), that are still unread, and are assigned to the
 * signed-in rep. Sorted newest first. Once the rep replies, the conversation's
 * last message becomes outbound and it drops off this list automatically.
 */

// Resolve the signed-in user's GHL user id (needed to scope the inbox to them).
async function resolveGhlUserId(supabase, email) {
  if (!email) return null;
  const e = email.toLowerCase();
  const { data: tm } = await supabase
    .from('team_members').select('ghl_user_id').ilike('email', e).maybeSingle();
  if (tm?.ghl_user_id) return tm.ghl_user_id;
  // Env fallbacks for the two primary reps.
  if (e.includes('jdoty') || e.startsWith('john@')) { if (process.env.GHL_USER_ID_JOHN) return process.env.GHL_USER_ID_JOHN; }
  if (e.includes('ssparks') || e.includes('sparksify') || e.includes('steve')) { if (process.env.GHL_USER_ID_STEVE) return process.env.GHL_USER_ID_STEVE; }
  // Last resort: look it up live from GHL by email.
  try { return await getGHLUserIdByEmail(email); } catch { return null; }
}

function pick(o, keys) { for (const k of keys) { if (o[k] != null && o[k] !== '') return o[k]; } return null; }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return res.json({ conversations: [], reason: 'GHL not configured' });

  const supabase = getSupabaseAdmin();
  const ghlUserId = await resolveGhlUserId(supabase, session.user?.email);

  const params = new URLSearchParams({
    locationId,
    lastMessageDirection: 'inbound',
    status:               'unread',
    sortBy:               'last_message_date',
    sort:                 'desc',
    limit:                '50',
  });
  // Scope to the signed-in rep when we can identify their GHL user.
  if (ghlUserId) params.set('assignedTo', ghlUserId);

  try {
    const r = await fetch(`${GHL_API}/conversations/search?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => r.statusText);
      console.error('[inbox] GHL search error', r.status, txt);
      return res.status(502).json({ conversations: [], error: `GHL ${r.status}` });
    }
    const data = await r.json();
    const rows = data.conversations || data.conversation || [];

    const conversations = rows.map(c => ({
      id:            c.id,
      contactId:     pick(c, ['contactId', 'contact_id']),
      name:          pick(c, ['fullName', 'contactName', 'full_name', 'name']) || 'Unknown',
      email:         pick(c, ['email']) || null,
      phone:         pick(c, ['phone']) || null,
      lastMessage:   pick(c, ['lastMessageBody', 'last_message_body']) || '',
      lastType:      pick(c, ['lastMessageType', 'last_message_type']) || '',
      lastDate:      pick(c, ['lastMessageDate', 'last_message_date', 'dateUpdated', 'dateAdded']),
      unreadCount:   c.unreadCount ?? c.unread_count ?? 0,
    }))
    // Defensive: only keep ones whose last message really is inbound (some GHL
    // rows report direction on the row).
    .filter(c => {
      const dir = String(rows.find(x => x.id === c.id)?.lastMessageDirection || 'inbound').toLowerCase();
      return dir !== 'outbound';
    });

    return res.json({ conversations, scopedToUser: !!ghlUserId });
  } catch (e) {
    console.error('[inbox] exception', e.message);
    return res.status(500).json({ conversations: [], error: e.message });
  }
}
