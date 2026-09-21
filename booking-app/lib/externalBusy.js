/**
 * lib/externalBusy.js
 *
 * Lean per-rep busy intervals from the EXTERNAL booking sources (GoHighLevel
 * calendars + Calendly) so the KANSO availability engine and booking endpoint
 * can block slots that were taken outside the app. Google Calendar free/busy
 * misses these when the external tool doesn't mirror events onto the rep's
 * Google Calendar — that gap is how a rep ends up double-booked at one time.
 *
 * Unlike the dashboard's fetchGHL/fetchCalendly, this does NO contact or
 * invitee enrichment — just event times + the assigned rep. Failures return
 * empty busy sets so booking pages never break when an external API is down.
 *
 * Returns: { [canonicalRepName]: [{ start: ISO, end: ISO }] }
 */
import { normalizeRepName } from '@/lib/repName';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const CAL_API     = 'https://api.calendly.com';
const DEFAULT_GHL_CALENDAR_ID   = 'Zd3fg5KnNbH5FEIHhq8R';
const DEFAULT_GHL_CALENDAR_ID_2 = 'h35V7plFqYf6DyY4zsdV';
const DEFAULT_CAL_USER = 'https://api.calendly.com/users/c59a21b9-aa46-45a7-8e8a-3e2faa614742';

const CANCELLED_GHL = new Set(['cancelled', 'canceled', 'invalid', 'noshow', 'no-show', 'no_show']);

async function ghlBusy(from, to) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return [];

  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Version': GHL_VERSION };
  const calendarIds = [
    process.env.GHL_CALENDAR_ID   || DEFAULT_GHL_CALENDAR_ID,
    process.env.GHL_CALENDAR_ID_2 || DEFAULT_GHL_CALENDAR_ID_2,
  ];

  const results = await Promise.allSettled(
    calendarIds.map(calendarId => {
      const params = new URLSearchParams({
        locationId, calendarId,
        startTime: String(from.getTime()),
        endTime:   String(to.getTime()),
      });
      return fetch(`${GHL_API}/calendars/events?${params}`, { headers })
        .then(r => r.ok ? r.json() : null);
    })
  );

  const seen = new Set();
  const events = [];
  for (const res of results) {
    if (res.status !== 'fulfilled' || !res.value) continue;
    for (const ev of (res.value.events || res.value.appointments || [])) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      const status = String(ev.appointmentStatus || ev.status || '').toLowerCase().replace(/\s+/g, '_');
      if (CANCELLED_GHL.has(status)) continue;
      events.push(ev);
    }
  }
  if (!events.length) return [];

  // Resolve assigned users to names (usually 1–2 unique ids)
  const uids = [...new Set(events.map(ev => ev.assignedUserId).filter(Boolean))];
  const userName = {};
  await Promise.allSettled(uids.map(uid =>
    fetch(`${GHL_API}/users/${uid}`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const u = d?.user || d;
        if (u) userName[uid] = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || null;
      })
  ));

  return events.map(ev => ({
    start: ev.startTime || ev.start_time,
    end:   ev.endTime   || ev.end_time,
    rep:   normalizeRepName(userName[ev.assignedUserId] || null),
  })).filter(b => b.start && b.end);
}

async function calendlyBusy(from, to) {
  const apiKey = process.env.CALENDLY_API_KEY;
  if (!apiKey) return [];
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  let orgUri = process.env.CALENDLY_ORG_URI || null;
  if (!orgUri) {
    try {
      const meRes = await fetch(`${CAL_API}/users/me`, { headers });
      if (meRes.ok) orgUri = (await meRes.json()).resource?.current_organization || null;
    } catch { /* fall through to user scope */ }
  }
  const scope = orgUri
    ? { organization: orgUri }
    : { user: process.env.CALENDLY_USER_URI || DEFAULT_CAL_USER };

  const busy = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      ...scope,
      status: 'active',
      count: '100',
      min_start_time: from.toISOString(),
      max_start_time: to.toISOString(),
      ...(pageToken ? { page_token: pageToken } : {}),
    });
    const r = await fetch(`${CAL_API}/scheduled_events?${params}`, { headers });
    if (!r.ok) return busy;
    const body = await r.json();
    for (const ev of body.collection || []) {
      busy.push({
        start: ev.start_time,
        end:   ev.end_time,
        rep:   normalizeRepName(ev.event_memberships?.[0]?.user_email || null),
      });
    }
    pageToken = body.pagination?.next_page_token || null;
  } while (pageToken);
  return busy;
}

/**
 * Busy intervals from GHL + Calendly between two Dates, grouped by canonical
 * rep name. Intervals with no resolvable rep land under '__unassigned'.
 * Never throws.
 */
export async function getExternalBusyByRep(from, to) {
  const [ghl, cal] = await Promise.allSettled([ghlBusy(from, to), calendlyBusy(from, to)]);
  const byRep = {};
  for (const res of [ghl, cal]) {
    if (res.status !== 'fulfilled') { console.warn('[externalBusy]', res.reason?.message); continue; }
    for (const b of res.value) {
      const key = b.rep || '__unassigned';
      (byRep[key] = byRep[key] || []).push({ start: b.start, end: b.end });
    }
  }
  return byRep;
}

/** Does [startIso, endIso) overlap any interval in the list? */
export function overlapsBusy(intervals, startIso, endIso) {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  return (intervals || []).some(b => {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    return bs < e && be > s;
  });
}
