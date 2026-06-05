/**
 * POST /api/dashboard/check-confirmation
 *
 * Queries the GHL SMS conversation for a contact and determines whether
 * they have confirmed, declined, or not responded to the appointment.
 *
 * Body: { bookingId, ghl_contact_id, booking_created_at?, force_refresh? }
 *
 * Returns:
 *   { status: 'confirmed'|'declined'|'uncertain'|'no_response', note: string, cached: bool }
 *
 * Results are cached in bookings.sms_confirmation for 2 hours so we don't
 * hammer the GHL API on every page load.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const CACHE_TTL   = 2 * 60 * 60 * 1000; // 2 hours in ms

// ─── Keyword patterns ─────────────────────────────────────────────────────────

const CONFIRMED_RE = /\byes\b|confirm|i'?ll be there|see you|looking forward|will be there|sounds good|on my way|heading over|i'?m in|absolutely|perfect|great|👍|✅|🙏|for sure|definitely|count me in/i;

const DECLINED_RE = /\bno\b|can'?t make it|cannot make|cancel|reschedule|won'?t be able|won'?t be there|something came up|unable to|can not make|not going to work|have to cancel|need to cancel|postpone|not going to be able/i;

const UNCERTAIN_RE = /\bmaybe\b|might|not sure|let me check|i'?ll try|possibly|depends|i think so|hopefully|should be/i;

// ─── GHL helpers ──────────────────────────────────────────────────────────────

async function findConversation(contactId) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;

  const res = await fetch(
    `${GHL_API}/conversations/search?locationId=${locationId}&contactId=${contactId}&limit=5`,
    { headers: { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.conversations?.[0] ?? null;
}

async function getConversationMessages(conversationId, limit = 30) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(
    `${GHL_API}/conversations/${conversationId}/messages?limit=${limit}`,
    { headers: { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages ?? [];
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

function analyzeMessages(messages, afterDate) {
  // Only look at inbound messages (from the lead) after the booking was created
  const cutoff = afterDate ? new Date(afterDate) : new Date(0);

  const inbound = messages.filter(m =>
    m.direction === 'inbound' &&
    new Date(m.dateAdded || m.createdAt || 0) >= cutoff &&
    (m.body || m.text || '')
  );

  if (inbound.length === 0) return { status: 'no_response', note: null };

  // Analyze most recent inbound messages (last 5)
  const recent = inbound.slice(-5);
  const combinedText = recent.map(m => (m.body || m.text || '').toLowerCase()).join(' ');
  const lastMsg = recent[recent.length - 1];
  const snippet = (lastMsg?.body || lastMsg?.text || '').slice(0, 120);

  if (DECLINED_RE.test(combinedText)) return { status: 'declined', note: snippet };
  if (CONFIRMED_RE.test(combinedText)) return { status: 'confirmed', note: snippet };
  if (UNCERTAIN_RE.test(combinedText)) return { status: 'uncertain', note: snippet };

  // They replied but content is ambiguous — still counts as "no clear confirmation"
  return { status: 'no_response', note: snippet };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { bookingId, ghl_contact_id, booking_created_at, force_refresh } = req.body;

  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });

  const supabase = getSupabaseAdmin();

  // Check if we have a fresh cached result
  if (!force_refresh) {
    const { data: existing } = await supabase
      .from('bookings')
      .select('sms_confirmation, sms_confirmation_at, sms_confirmation_note')
      .eq('id', bookingId)
      .maybeSingle();

    if (existing?.sms_confirmation && existing.sms_confirmation_at) {
      const age = Date.now() - new Date(existing.sms_confirmation_at).getTime();
      if (age < CACHE_TTL) {
        return res.json({
          status:  existing.sms_confirmation,
          note:    existing.sms_confirmation_note,
          cached:  true,
        });
      }
    }
  }

  // No valid cache — need to query GHL
  if (!ghl_contact_id) {
    return res.json({ status: 'no_response', note: null, cached: false });
  }

  try {
    const conversation = await findConversation(ghl_contact_id);
    if (!conversation) {
      return res.json({ status: 'no_response', note: null, cached: false });
    }

    const messages = await getConversationMessages(conversation.id, 40);
    const result   = analyzeMessages(messages, booking_created_at);

    // Cache result on the booking row
    await supabase.from('bookings').update({
      sms_confirmation:      result.status,
      sms_confirmation_at:   new Date().toISOString(),
      sms_confirmation_note: result.note,
    }).eq('id', bookingId);

    return res.json({ ...result, cached: false });

  } catch (err) {
    console.error('[check-confirmation]', err.message);
    return res.json({ status: 'no_response', note: null, cached: false, error: err.message });
  }
}
