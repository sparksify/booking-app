import { getSupabaseAdmin } from '@/lib/supabase';
import { getRepIdentity, repMatches } from '@/lib/role';
import {
  fetchSupabase, fetchCalendly, fetchGHL, getDayBoundsUTC, BOOKING_TZ,
} from '@/pages/api/dashboard/bookings';

/**
 * Returns the logged-in rep's own upcoming, still-scheduled meetings across all
 * three sources (native KANSO bookings, Calendly, GoHighLevel) for the next 14
 * days — deduped and filtered to the rep's identity. Used by the transfer
 * endpoints so the candidate list matches what the rep actually sees on the
 * Meetings page (not just native bookings).
 */
export async function getRepUpcomingMeetings(meEmail) {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const { from } = getDayBoundsUTC(now, BOOKING_TZ);
  const endDay = new Date(now); endDay.setDate(endDay.getDate() + 14);
  const { to } = getDayBoundsUTC(endDay, BOOKING_TZ);

  const [sb, cal, ghl] = await Promise.all([
    fetchSupabase(supabase, from, to).catch(() => []),
    fetchCalendly(from, to).catch(() => []),
    fetchGHL(from, to).catch(() => []),
  ]);

  const sbTagged = (sb || []).map(b => ({
    ...b,
    _source_display: 'KANSO',
    booking_source: b.booking_source || 'direct',
  }));

  // Dedup by client email + 30-min slot bucket (GHL first, then native, then Calendly)
  const seen = new Set();
  const merged = [];
  for (const b of [...(ghl || []), ...sbTagged, ...(cal || [])]) {
    const key = (b.email && b.slot_start)
      ? `${b.email.toLowerCase()}:${Math.round(new Date(b.slot_start).getTime() / (30 * 60_000))}`
      : `nokey_${merged.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(b);
  }

  const ident = await getRepIdentity(meEmail);
  const nowMs = Date.now();
  return merged
    .filter(b =>
      b.slot_start &&
      new Date(b.slot_start).getTime() >= nowMs &&
      (b.status || 'scheduled') === 'scheduled' &&
      repMatches(b.assigned_to_email, ident)
    )
    .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime());
}
