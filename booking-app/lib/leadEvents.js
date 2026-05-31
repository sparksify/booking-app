import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * logLeadEvent — insert a single event into lead_events.
 *
 * @param {string}  email      — lead's email (always required — primary lookup key)
 * @param {string}  eventType  — snake_case event name, e.g. 'appointment_booked'
 * @param {object}  [eventData={}] — arbitrary JSON metadata for this event
 * @param {object}  [opts={}]
 * @param {string}  [opts.leadId]    — Facebook lead token, if known
 * @param {string}  [opts.bookingId] — Supabase booking UUID, if applicable
 *
 * Errors are swallowed with a console.warn so event logging never blocks a response.
 */
export async function logLeadEvent(email, eventType, eventData = {}, opts = {}) {
  if (!email || !eventType) return;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('lead_events').insert({
      email,
      lead_id:    opts.leadId    ?? null,
      booking_id: opts.bookingId ?? null,
      event_type: eventType,
      event_data: eventData,
    });
    if (error) console.warn('[leadEvents] insert error:', error.message);
  } catch (err) {
    console.warn('[leadEvents] unexpected error:', err.message);
  }
}

/**
 * getLeadTimeline — fetch all events for an email, newest first.
 *
 * @param {string} email
 * @returns {Array} events sorted ascending by created_at (chronological)
 */
export async function getLeadTimeline(email) {
  if (!email) return [];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('lead_events')
      .select('id, event_type, event_data, created_at')
      .eq('email', email)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[leadEvents] fetch error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[leadEvents] unexpected fetch error:', err.message);
    return [];
  }
}
