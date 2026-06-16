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

const CONFIRMED_RE = /\byes\b|confirm|i'?ll be there|see you|looking forward|will be there|sounds good|on my way|heading over|i'?m in|absolutely|perfect|great|👍|✅|🙏|for sure|definitely|count me in|already (?:booked|scheduled|set)|already have (?:a |some )?time|have (?:a |some )?time (?:booked|scheduled|set)|booked (?:a |some )?time|we'?re (?:booked|scheduled|set|good)|got (?:a |some )?time (?:booked|scheduled|set)|talk(?: to you)? then|that works|works for me/i;

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
  // Cut at the team's reminder/confirmation boilerplate that gets quoted back
  // inside a reply (these phrases never come from the lead, and they carry the
  // "Cancel"/"Reschedule" links that were causing false declines).
  t = t.split(/\b(?:Just a quick reminder|you'?re scheduled to speak|you'?re all set|We'?ll (?:be )?call(?:ing)? you|Add to (?:Google |iCal )?(?:Calendar|Outlook)|reply\s+["']?Confirmed|If anything (?:changes|comes up))/i)[0];
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

  const msgDate = m => new Date(m.dateAdded || m.createdAt || m.dateUpdated || 0);

  // All of the LEAD's messages (inbound), regardless of GHL's return order.
  let inbound = (messages || []).filter(m => m.direction === 'inbound' && (m.body || m.text || ''));

  // Respect the booking cutoff, but never let it wipe out everything — clock
  // skew or a missing created_at shouldn't make a real reply vanish.
  const afterCutoff = inbound.filter(m => msgDate(m) >= cutoff);
  if (afterCutoff.length) inbound = afterCutoff;

  if (inbound.length === 0) return { status: 'no_response', note: null };

  // Sort oldest → newest so "latest" is genuinely their most recent reply
  // (GHL returns messages newest-first).
  inbound.sort((a, b) => msgDate(a) - msgDate(b));

  // Strip quoted email history from each so we only weigh the lead's own words.
  const cleaned = inbound
    .map(m => stripQuoted(m.body || m.text || ''))
    .filter(Boolean);
  if (cleaned.length === 0) return { status: 'no_response', note: null };

  const classify = (txt) => {
    const t = txt.toLowerCase();
    if (DECLINED_RE.test(t))  return 'declined';
    if (CONFIRMED_RE.test(t)) return 'confirmed';
    if (UNCERTAIN_RE.test(t)) return 'uncertain';
    return null;
  };

  const latest  = cleaned[cleaned.length - 1];
  const snippet = latest.slice(0, 120);

  // Their most recent reply is their current intent — if it's clear, use it.
  const latestVerdict = classify(latest);
  if (latestVerdict) return { status: latestVerdict, note: snippet };

  // Latest reply was ambiguous — fall back to the totality of everything they
  // said, so a clear confirm/decline anywhere in their replies still counts.
  const wholeVerdict = classify(cleaned.join('  '));
  if (wholeVerdict) return { status: wholeVerdict, note: snippet };

  return { status: 'no_response', note: snippet };
}

// ─── AI classification (primary) ───────────────────────────────────────────────

/**
 * Builds a compact, labeled transcript (oldest → newest). The lead's messages
 * are kept fuller; the team's automated boilerplate is truncated to save tokens.
 */
function buildTranscript(messages) {
  const msgDate = m => new Date(m.dateAdded || m.createdAt || m.dateUpdated || 0);
  const sorted = [...(messages || [])]
    .filter(m => (m.body || m.text || '').trim())
    .sort((a, b) => msgDate(a) - msgDate(b))
    .slice(-40);
  return sorted
    .map(m => {
      const who  = m.direction === 'inbound' ? 'LEAD' : 'TEAM';
      const body = stripQuoted(m.body || m.text || '');
      const max  = who === 'LEAD' ? 500 : 140;
      const text = body.slice(0, max).replace(/\s+/g, ' ').trim();
      return text ? `${who}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Classifies the LEAD's appointment intent with a small, cheap model. Returns
 * null on any problem (missing key, model error, bad output) so the caller falls
 * back to keyword matching.
 */
async function classifyWithAI(transcript) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !transcript) return null;
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

  const prompt = `You are reviewing a text/email thread between a sales & scheduling TEAM and a LEAD who has an upcoming appointment booked.

Decide whether THE LEAD has confirmed they will attend. Judge ONLY by what the LEAD says. Completely ignore the TEAM's automated messages, reminders, links, and boilerplate (phrases like "reply Confirmed", "reschedule", or "cancel" in TEAM messages do NOT count).

CRITICAL: A LEAD message (especially an email) often quotes the team's previous message BELOW the lead's actual reply — including reminder text and "Cancel" / "Reschedule" links. That quoted text is NOT the lead's words. NEVER treat quoted reminder text or those links as the lead declining or rescheduling. Only the lead's own newly-typed words count. If the lead's own words are an affirmation like "Confirmed" — even if quoted reminder/Cancel/Reschedule text appears after it — that is CONFIRMED.

Return ONLY a compact JSON object, nothing else:
{"status":"confirmed|declined|uncertain|no_response","reason":"<=12 words"}

Definitions:
- confirmed: the lead affirms attendance or the booking — e.g. "yes", "confirmed", "I already booked some time", "see you then", "that works".
- declined: the lead says they can't make it, wants to cancel, reschedule, or won't attend.
- uncertain: tentative — "maybe", "I'll try", "not sure".
- no_response: the lead never meaningfully replied about the appointment.

THREAD (oldest to newest):
${transcript}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) {
      console.error('[check-confirmation] AI HTTP', r.status, (await r.text().catch(() => '')).slice(0, 200));
      return null;
    }
    const data = await r.json();
    const text = (data?.content?.[0]?.text || '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const valid = ['confirmed', 'declined', 'uncertain', 'no_response'];
    if (!valid.includes(parsed.status)) return null;
    return { status: parsed.status, note: parsed.reason || null };
  } catch (err) {
    console.error('[check-confirmation] AI error', err.message);
    return null;
  }
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

  // Calendly/GHL meetings have no bookings row — cache their result by GHL
  // contact id so we don't re-run the AI on every dashboard load.
  if (!isUuid && ghl_contact_id && !force_refresh) {
    const { data: cc } = await supabase
      .from('confirmation_cache')
      .select('status, note, checked_at')
      .eq('contact_id', ghl_contact_id)
      .maybeSingle();
    if (cc?.status && cc.checked_at && (Date.now() - new Date(cc.checked_at).getTime()) < CACHE_TTL) {
      return res.json({ status: cc.status, note: cc.note, cached: true });
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

    // Primary: let a small model read the whole thread and judge the lead's
    // intent. Falls back to keyword matching if no API key or on any error.
    let result = await classifyWithAI(buildTranscript(messages));
    if (!result) result = analyzeMessages(messages, booking_created_at);

    // Cache result on the booking row (only for real uuid-keyed bookings;
    // GHL synthetic ids aren't persisted and are re-checked each load).
    if (isUuid) {
      await supabase.from('bookings').update({
        sms_confirmation:      result.status,
        sms_confirmation_at:   new Date().toISOString(),
        sms_confirmation_note: result.note,
      }).eq('id', bookingId);
    } else if (ghl_contact_id) {
      await supabase.from('confirmation_cache').upsert({
        contact_id: ghl_contact_id,
        status:     result.status,
        note:       result.note,
        checked_at: new Date().toISOString(),
      });
    }

    return res.json({ ...result, cached: false });

  } catch (err) {
    console.error('[check-confirmation]', err.message);
    return res.json({ status: 'no_response', note: null, cached: false, error: err.message });
  }
}
