import crypto from 'node:crypto';
export const TOKEN_TTL_MS = 60 * 60 * 1000;
export function validateRedirect(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a full HTTPS thank-you URL.');
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.port || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname) || url.hostname.endsWith('.local')) throw new Error('Use a public HTTPS URL without credentials, query parameters, or a fragment.');
  return url.href;
}
export function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
export async function issueConfirmation(db, bookingId, destination, timezone, title, now = Date.now()) {
  const audience = validateRedirect(destination);
  if (!audience) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const { error } = await db.from('booking_confirmations').insert({ token_hash: tokenHash(token), booking_id: bookingId, audience, timezone, title, expires_at: new Date(now + TOKEN_TTL_MS).toISOString() });
  if (error) throw new Error('Confirmation reference could not be saved');
  const url = new URL(audience); url.hash = new URLSearchParams({ ref: token }).toString();
  return url.href;
}
export async function resolveConfirmation(db, token, audience, now = Date.now()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data: ref, error } = await db.from('booking_confirmations').select('booking_id,audience,timezone,title,expires_at').eq('token_hash', tokenHash(token)).maybeSingle();
  if (error) throw new Error('Confirmation lookup unavailable');
  if (!ref || ref.audience !== audience || Date.parse(ref.expires_at) <= now) return null;
  const { data: booking, error: bookingError } = await db.from('bookings').select('slot_start,slot_end,assigned_to_email,google_event_id,status').eq('id', ref.booking_id).maybeSingle();
  if (bookingError) throw new Error('Booking lookup unavailable');
  if (!booking || booking.status !== 'scheduled' || !booking.google_event_id || !booking.assigned_to_email) return null;
  const { data: member, error: memberError } = await db.from('team_members').select('name').eq('email', booking.assigned_to_email).maybeSingle();
  if (memberError) throw new Error('Consultant lookup unavailable');
  return { start: booking.slot_start, end: booking.slot_end, timezone: ref.timezone, title: ref.title, consultant: member?.name || 'Your consultant', duration: Math.round((Date.parse(booking.slot_end) - Date.parse(booking.slot_start)) / 60000) };
}
