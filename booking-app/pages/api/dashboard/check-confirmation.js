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

// NOTE: deliberately does NOT include a bare "no" — phrases like "no problem"
// are positive. Decline must be an explicit can't-make-it / cancel / reschedule.
const DECLINED_RE = /can'?t make|cannot make|can ?not make|\bcancel|reschedul|won'?t be (?:able|there)|will not be able|unable to (?:make|attend|come)|something came up|not going to (?:work|make)|have to (?:cancel|move)|need to (?:cancel|move|reschedule)|postpone/i;

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
  if (!res.ok) {
    console.error(`[check-confirmation] conversation search HTTP ${res.status} for contact ${contactId}`);
    return null;
  }
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
  if (!res.ok) {
    // A 401 here almost always means the GHL private-integration token is
    // missing the "conversations/message.readonly" scope. Surface it.
    console.error(`[check-confirmation] messages fetch HTTP ${res.status} for conversation ${conversationId}`);
    return [];
  }
  const data = await res.json();
  // GHL nests the array: { messages: { messages: [...], nextPage, lastMessageId } }.
  // Guard against the flat shape too, and never hand a non-array to the analyzer.
  const list = data?.messages?.messages ?? data?.messages ?? [];
  return Array.isArray(list) ? list : [];
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Strips quoted email history from a reply so we only analyze the client's own
 * words. Email replies quote the entire outbound message back — including our
 * boilerplate ("no problem… we'll get you rescheduled… reply Confirmed") — which
 * otherwise trips the decline keywords on a genuine confirmation.
 */
function stripQuoted(text) {
  if (!text) return '';
  let t = String(text);
  // Remove HTML quoted blocks first — Gmail/Outlook wrap the original message
  // in these, and a reply stored as HTML hides the boilerplate from line-based
  // stripping.
  t = t.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ');
  t = t.replace(/<div[^>]*gmail_quote[\s\S]*$/i, ' ');
  // Cut at the quoted-reply header wherever it appears (plain text OR flattened
  // HTML). Not line-anchored, so "...Confirmed! On Mon, Jun 8 … wrote: …" works.
  t = t.split(/\bOn\b[^\n]{0,300}?\bwrote:/i)[0];
  t = t.split(/_{5,}|-{2,}\s*Original Message/i)[0];
  t = t.split(/\bFrom:\s[^\n]+?\bSent:/is)[0];
  // Drop any remaining quoted lines (start with ">").
  t = t.split('\n').filter(line => !/^\s*>/.test(line)).join('\n');
  // Flatten any leftover HTML to plain text.
  t = t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
  return t.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function analyzeMessages(messages, afterDate) {
  // Only look at inbound messages (from the lead) after the booking was created
  const cutoff = afterDate ? new Date(afterDate) : new Date(0);

  const inbound = messages.filter(m =>
    m.direction === 'inbound' &&
    new Date(m.dateAdded || m.createdAt || 0) >= cutoff &&
    (m.body || m.text || '')
  );

  if (inbound.length === 0) return { status: 'no_response', note: null };

  // Strip quoted history, then analyze the client's most recent replies only.
  const cleaned = inbound
    .map(m => stripQuoted(m.body || m.text || ''))
    .filter(Boolean);
  if (cleaned.length === 0) return { status: 'no_response', note: null };

  // Judge by the client's MOST RECENT reply only — that's their current intent.
  // Blending several messages let quoted/older words override a clear reply.
  const latest  = cleaned[cleaned.length - 1];
  const text    = latest.toLowerCase();
  const snippet = latest.slice(0, 120);

  if (DECLINED_RE.test(text))  return { status: 'declined',  note: snippet };
  if (CONFIRMED_RE.test(text)) return { status: 'confirmed', note: snippet };
  if (UNCERTAIN_RE.test(text)) return { status: 'uncertain', note: snippet };

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

  // GHL-sourced bookings have synthetic ids like `ghl_<eventId>` that don't
  // exist in the bookings table (whose id column is a uuid). Skip the DB cache
  // entirely for those — query GHL live and return without persisting.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId);

  // Check if we have a fresh cached result
  if (isUuid && !force_refresh) {
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

    // Cache result on the booking row (only for real uuid-keyed bookings;
    // GHL synthetic ids aren't persisted and are re-checked each load).
    if (isUuid) {
      await supabase.from('bookings').update({
        sms_confirmation:      result.status,
        sms_confirmation_at:   new Date().toISOString(),
        sms_confirmation_note: result.note,
      }).eq('id', bookingId);
    }

    return res.json({ ...result, cached: false });

  } catch (err) {
    console.error('[check-confirmation]', err.message);
    return res.json({ status: 'no_response', note: null, cached: false, error: err.message });
  }
}
