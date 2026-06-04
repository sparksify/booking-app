/**
 * lib/bluebubbles.js
 *
 * Thin wrapper around the BlueBubbles Server REST API.
 * Server URL and password are fetched from the settings table at call time
 * so they can be updated in the dashboard without redeploying.
 *
 * BlueBubbles API base: https://your-server-url
 * Auth: ?password=xxx query param on every request
 *
 * Key endpoints used:
 *   GET  /api/v1/server/info           → ping / verify connection
 *   POST /api/v1/message/text          → send an iMessage or SMS
 *   GET  /api/v1/chat                  → list chats
 *   GET  /api/v1/chat/{guid}/message   → get messages for a specific chat
 *   POST /api/v1/chat/query            → find a chat by phone number / email
 */

import { getSupabaseAdmin } from './supabase';

// ─── Credential loader ────────────────────────────────────────────────────────

let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 60_000; // re-fetch creds at most once per minute

async function getCredentials() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('settings')
    .select('bluebubbles_url, bluebubbles_password')
    .eq('id', 1)
    .single();

  if (error || !data?.bluebubbles_url) {
    throw new Error('BlueBubbles server URL not configured in settings');
  }

  _cache  = { url: data.bluebubbles_url.replace(/\/$/, ''), password: data.bluebubbles_password || '' };
  _cacheAt = now;
  return _cache;
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function bbFetch(path, { method = 'GET', body } = {}) {
  const { url, password } = await getCredentials();
  const sep = path.includes('?') ? '&' : '?';
  const fullUrl = `${url}${path}${sep}password=${encodeURIComponent(password)}`;

  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(fullUrl, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`BlueBubbles ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verify the server is reachable and the password is correct.
 * Returns { ok: true, version: '...' } or throws.
 */
export async function ping() {
  const data = await bbFetch('/api/v1/server/info');
  return { ok: true, version: data?.data?.version || 'unknown' };
}

/**
 * Send an iMessage (or SMS fallback) to a phone number or email address.
 *
 * @param {string} address   — phone number (+1XXXXXXXXXX) or Apple ID email
 * @param {string} message   — message text
 * @param {string} [method]  — 'apple-script' (default) | 'private-api'
 * @returns {{ guid: string, tempGuid: string }}
 */
export async function sendMessage(address, message, method = 'apple-script') {
  const data = await bbFetch('/api/v1/message/text', {
    method: 'POST',
    body: { address, message, method },
  });
  return data?.data || data;
}

/**
 * Fetch message history for a given phone number or email.
 * Finds (or creates) the chat first, then loads messages.
 *
 * @param {string} address   — phone number or Apple ID email
 * @param {number} [limit]   — max messages to return (default 50)
 * @returns {Array<BBMessage>}
 */
export async function getMessages(address, limit = 50) {
  // Find the chat GUID for this address
  const chatGuid = await findChatGuid(address);
  if (!chatGuid) return [];

  const data = await bbFetch(
    `/api/v1/chat/${encodeURIComponent(chatGuid)}/message?limit=${limit}&sort=DESC`
  );
  return (data?.data || []).reverse(); // oldest first
}

/**
 * Look up the chat GUID for a phone number or email.
 * Returns null if no chat found.
 *
 * @param {string} address
 * @returns {string|null}
 */
export async function findChatGuid(address) {
  try {
    // BlueBubbles stores chats with GUIDs like:
    //   iMessage;-;+15551234567
    //   SMS;-;+15551234567
    // Query the chat list and filter client-side for the address.
    const data = await bbFetch(`/api/v1/chat?limit=200`);
    const chats = data?.data || [];

    const normalized = normalizePhone(address);
    for (const chat of chats) {
      if (!chat.guid) continue;
      const guidParts = chat.guid.split(';-;');
      const chatAddr = guidParts[guidParts.length - 1];
      if (normalizePhone(chatAddr) === normalized) {
        return chat.guid;
      }
      // Also check participants
      if (chat.participants?.some(p => normalizePhone(p.address) === normalized)) {
        return chat.guid;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize phone numbers for comparison (strip all non-digits, keep leading +1).
 */
function normalizePhone(str) {
  if (!str) return '';
  // If it looks like an email, lowercase and return as-is
  if (str.includes('@')) return str.toLowerCase();
  const digits = str.replace(/\D/g, '');
  // Strip leading country code 1 if 11 digits
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/**
 * Invalidate the credentials cache (call after saving new settings).
 */
export function invalidateBBCache() {
  _cache  = null;
  _cacheAt = 0;
}
