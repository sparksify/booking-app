import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { computeLeadScore, computeShowProbability, getHealthBadge } from '@/lib/scoring';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const CAL_API     = 'https://api.calendly.com';
// Known user URI — override via CALENDLY_USER_URI env var if the account ever changes
const DEFAULT_CAL_USER = 'https://api.calendly.com/users/c59a21b9-aa46-45a7-8e8a-3e2faa614742';

// GHL calendars to pull appointments from
// Cal 1 (main / Steve Sparks) — override via GHL_CALENDAR_ID
const DEFAULT_GHL_CALENDAR_ID   = 'Zd3fg5KnNbH5FEIHhq8R';
// Cal 2 (John Doty) — override via GHL_CALENDAR_ID_2
const DEFAULT_GHL_CALENDAR_ID_2 = 'h35V7plFqYf6DyY4zsdV';

// Timezone used for date boundary calculations — must match settings.timezone
const BOOKING_TZ = process.env.BOOKING_TIMEZONE || 'America/Chicago';

/**
 * Returns { from, to } as UTC Date objects that bound the full day
 * of `refDate` in the target timezone.
 * Uses noon as a DST-safe probe to compute the UTC offset.
 */
function getDayBoundsUTC(refDate, tz) {
  const dateStr = refDate.toLocaleDateString('en-CA', { timeZone: tz }); // 'YYYY-MM-DD'
  const probeNoon = new Date(`${dateStr}T12:00:00Z`);
  const locStr    = probeNoon.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
  const m         = locStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
  const offsetMins = m ? (m[1] === '+' ? 1 : -1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10)) : 0;
  const [y, mo, d] = dateStr.split('-').map(Number);
  return {
    from: new Date(Date.UTC(y, mo - 1, d,  0,  0,  0,   0) - offsetMins * 60_000),
    to:   new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999) - offsetMins * 60_000),
  };
}

// Emails used for internal testing — excluded from all booking sources
const TEST_EMAILS = new Set([
  'ssparks@thefranchiseconsultingcompany.com',
  'steve@sparksify.com',
]);

/**
 * GET /api/dashboard/bookings
 *
 * Returns merged bookings from three sources:
 *   1. Supabase  — booked through the FranchiseBook booking page
 *   2. Calendly  — booked through Calendly (requires CALENDLY_API_KEY env var)
 *   3. GHL       — booked through GoHighLevel / CloseBot (uses existing GHL_API_KEY)
 *
 * Each booking has `_source_display`: 'FranchiseBook' | 'Calendly' | 'GoHighLevel'
 *
 * Query params:
 *   filter = 'today' | 'tomorrow' | 'week' | 'all'  (default: 'today')
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const filter   = req.query.filter || 'today';
  const supabase = getSupabaseAdmin();
  const now      = new Date();
  let from, to;

  if (filter === 'today') {
    // Use timezone-aware bounds so "today" = today in CDT, not UTC midnight
    ({ from, to } = getDayBoundsUTC(now, BOOKING_TZ));
  } else if (filter === 'tomorrow') {
    const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
    ({ from, to } = getDayBoundsUTC(tmrw, BOOKING_TZ));
  } else if (filter === 'week') {
    const endDay = new Date(now); endDay.setDate(endDay.getDate() + 13);
    ({ from } = getDayBoundsUTC(now,    BOOKING_TZ));
    ({ to }   = getDayBoundsUTC(endDay, BOOKING_TZ));
  } else {
    // 'all': last 30 days → next 60 days
    const startDay = new Date(now); startDay.setDate(startDay.getDate() - 30);
    const endDay   = new Date(now); endDay.setDate(endDay.getDate() + 60);
    ({ from } = getDayBoundsUTC(startDay, BOOKING_TZ));
    ({ to }   = getDayBoundsUTC(endDay,   BOOKING_TZ));
  }

  // ── Fetch all three sources + settings in parallel ───────────────────────
  const [sbRes, calRes, ghlRes, settingsRes] = await Promise.allSettled([
    fetchSupabase(supabase, from, to),
    fetchCalendly(from, to),
    fetchGHL(from, to),
    supabase.from('settings').select('rep_avatars').eq('id', 1).single(),
  ]);

  if (sbRes.status  === 'rejected') console.error('[bookings] supabase:', sbRes.reason?.message);
  if (calRes.status === 'rejected') console.error('[bookings] calendly:', calRes.reason?.message);
  if (ghlRes.status === 'rejected') console.error('[bookings] ghl:',     ghlRes.reason?.message);

  const repAvatars = settingsRes.status === 'fulfilled'
    ? (settingsRes.value?.data?.rep_avatars || {})
    : {};

  const rawSB  = sbRes.status  === 'fulfilled' ? sbRes.value  : [];
  const calBks = calRes.status === 'fulfilled' ? calRes.value : [];
  const ghlBks = ghlRes.status === 'fulfilled' ? ghlRes.value : [];

  // Collect emails from ALL sources so we can enrich Calendly/GHL bookings with lead data too
  const allEmails = [...new Set(
    [...rawSB, ...calBks, ...ghlBks].map(b => b.email).filter(Boolean)
  )];
  let leadsByEmail = {};
  if (allEmails.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('email, status, ghl_contact_id, investment_level')
      .in('email', allEmails);
    (leads || []).forEach(l => { leadsByEmail[l.email?.toLowerCase()] = l; });
  }

  const sbBks = rawSB.map(b => {
    const lead           = leadsByEmail[b.email] ?? null;
    const leadScore      = b.lead_score       ?? computeLeadScore(b, lead);
    const showProb       = b.show_probability  ?? computeShowProbability(b, lead);
    const health         = getHealthBadge(leadScore, showProb);
    return {
      ...b,
      lead_status:      lead?.status         ?? null,
      ghl_contact_id:   lead?.ghl_contact_id ?? null,
      lead_score:       leadScore,
      show_probability: showProb,
      health,
      booking_source:   b.booking_source ?? 'direct',
      _source_display:  'KANSO',
    };
  });

  // Build a CQ timestamp lookup keyed by email (from Supabase — the only source that stores CQ data).
  // GHL/Calendly bookings hardcode cq_sent_at: null, so we must enrich them from Supabase after dedup.
  const cqByEmail = {};
  for (const b of rawSB) {
    if (!b.email) continue;
    const key = b.email.toLowerCase();
    if (!cqByEmail[key]) cqByEmail[key] = { cq_sent_at: null, cq_received_at: null };
    if (b.cq_sent_at)    cqByEmail[key].cq_sent_at    = b.cq_sent_at;
    if (b.cq_received_at) cqByEmail[key].cq_received_at = b.cq_received_at;
  }

  // Resolve the GHL contact (id + liquid capital) by email for every booking that
  // doesn't already carry a contact id. Everyone who reaches a booking page came in
  // as a GHL contact (Facebook Lead Ad → GHL), so this lets the SMS-confirmation
  // check run on every row — not just GHL-sourced ones — and also fills liquid
  // capital on the list without opening the side panel. Keyed by lowercased email.
  const ghlContactByEmail = {};
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (apiKey && locationId) {
    const emailsNeedingContact = [...new Set(
      [...ghlBks, ...sbBks, ...calBks]
        .filter(b => !b.ghl_contact_id && b.email)
        .map(b => b.email.toLowerCase())
    )];
    if (emailsNeedingContact.length) {
      const ghlHeaders = { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION };
      const contactResults = await Promise.allSettled(
        emailsNeedingContact.map(email =>
          fetch(`${GHL_API}/contacts/?locationId=${locationId}&query=${encodeURIComponent(email)}`, { headers: ghlHeaders })
            .then(r => r.ok ? r.json() : null)
            .then(d => d?.contacts?.[0] ?? null)
            .catch(() => null)
        )
      );
      emailsNeedingContact.forEach((email, i) => {
        const contact = contactResults[i].status === 'fulfilled' ? contactResults[i].value : null;
        if (contact) {
          ghlContactByEmail[email] = {
            id:            contact.id || null,
            liquidCapital: getGHLLiquidCapital(contact),
          };
        }
      });
    }
  }

  // Manual status overrides (showed / no-show / closed) keyed by email + 30-min
  // slot bucket. These let a rep's status stick regardless of booking source —
  // Calendly and GHL rows have no row in the bookings table to update.
  const statusOverrideByKey = {};
  {
    const { data: overrides } = await supabase
      .from('meeting_status_overrides')
      .select('email, slot_start, status');
    for (const o of overrides || []) {
      if (!o.email || !o.slot_start) continue;
      const k = `${o.email.toLowerCase()}:${Math.round(new Date(o.slot_start).getTime() / (30 * 60_000))}`;
      statusOverrideByKey[k] = o.status;
    }
  }

  // Merge — GHL first so it wins dedup (has liquid capital); then KANSO; then Calendly
  // Dedup: same email + same 30-min bucket across sources = same meeting, keep first seen
  const seenKeys = new Map();
  const deduped  = [];
  for (const b of [...ghlBks, ...sbBks, ...calBks]) {
    if (!b.email || !b.slot_start) { deduped.push(b); continue; }
    const slotMs   = new Date(b.slot_start).getTime();
    const key      = `${b.email.toLowerCase()}:${Math.round(slotMs / (30 * 60_000))}`;
    if (!seenKeys.has(key)) {
      seenKeys.set(key, true);
      const emailLow = b.email.toLowerCase();
      // Apply CQ timestamps from Supabase — GHL/Calendly rows always have them as null
      const cq   = cqByEmail[emailLow] || {};
      // Apply investment_level from leads table if the booking doesn't have it (Calendly rows)
      const lead = leadsByEmail[emailLow] || {};
      // GHL contact resolved by email (id + liquid capital) for rows missing a contact id
      const ghlC = ghlContactByEmail[emailLow] || {};
      deduped.push({
        ...b,
        // Manual override wins over the source's status (e.g. Calendly always
        // reports 'scheduled'; a rep marking no-show must take precedence).
        status:           statusOverrideByKey[key] || b.status,
        cq_sent_at:       b.cq_sent_at       || cq.cq_sent_at       || null,
        cq_received_at:   b.cq_received_at   || cq.cq_received_at   || null,
        ghl_contact_id:   b.ghl_contact_id   || ghlC.id             || null,
        investment_level: b.investment_level || ghlC.liquidCapital  || lead.investment_level || null,
      });
    }
  }

  // Final filter: remove test emails + enforce exact date range (guards against GHL TZ drift)
  const all = deduped
    .filter(b => !TEST_EMAILS.has((b.email || '').toLowerCase()))
    .filter(b => {
      if (!b.slot_start) return true;
      const t = new Date(b.slot_start).getTime();
      return t >= from.getTime() && t <= to.getTime();
    })
    .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime());

  res.json({ bookings: all, rep_avatars: repAvatars });
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

async function fetchSupabase(supabase, from, to) {
  let q = supabase
    .from('bookings')
    .select('id, first_name, last_name, email, phone, slot_start, slot_end, status, investment_level, assigned_to_email, meet_link, created_at, lead_score, show_probability, fb_attribution, booking_source, cq_sent_at, cq_received_at')
    .order('slot_start', { ascending: true });
  if (from && to) q = q.gte('slot_start', from.toISOString()).lte('slot_start', to.toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ─── Calendly ─────────────────────────────────────────────────────────────────

async function fetchCalendly(from, to) {
  const apiKey  = process.env.CALENDLY_API_KEY;
  if (!apiKey) return [];

  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  // Resolve org URI: prefer env var, otherwise fetch from /users/me
  let orgUri = process.env.CALENDLY_ORG_URI || null;
  if (!orgUri) {
    try {
      const meRes = await fetch(`${CAL_API}/users/me`, { headers });
      if (meRes.ok) {
        const meData = await meRes.json();
        orgUri = meData.resource?.current_organization || null;
        console.log('[bookings/calendly] resolved org URI:', orgUri);
      }
    } catch (e) {
      console.error('[bookings/calendly] /users/me failed:', e.message);
    }
  }

  // Build params: use organization-level fetch to get ALL team members' events.
  // Fall back to user-level if org URI couldn't be resolved.
  const userUri = process.env.CALENDLY_USER_URI || DEFAULT_CAL_USER;
  const scopeParam = orgUri
    ? { organization: orgUri }
    : { user: userUri };

  // Paginate through all results (Calendly max count=100 per page)
  const allEvents = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      ...scopeParam,
      status:         'active',
      count:          '100',
      sort:           'start_time:asc',
      min_start_time: from.toISOString(),
      max_start_time: to.toISOString(),
      ...(pageToken ? { page_token: pageToken } : {}),
    });

    const evRes = await fetch(`${CAL_API}/scheduled_events?${params}`, { headers });
    if (!evRes.ok) {
      const txt = await evRes.text();
      throw new Error(`Calendly events ${evRes.status}: ${txt.slice(0, 200)}`);
    }

    const body = await evRes.json();
    const page = body.collection || [];
    allEvents.push(...page);

    // Follow pagination cursor
    pageToken = body.pagination?.next_page_token || null;
  } while (pageToken);

  const events = allEvents;

  // Fetch invitees in parallel (one per event)
  const invResults = await Promise.allSettled(
    events.map(async ev => {
      const uuid = ev.uri.split('/').pop();
      const r = await fetch(`${CAL_API}/scheduled_events/${uuid}/invitees?count=1`, { headers });
      if (!r.ok) return null;
      const d = await r.json();
      return d.collection?.[0] ?? null;
    })
  );

  // Build base bookings first so we have emails
  const base = events.map((ev, i) => {
    const inv = invResults[i].status === 'fulfilled' ? invResults[i].value : null;
    const fullName = inv?.name || '';
    const [fn, ...rest] = fullName.split(' ');
    const phone = (inv?.questions_and_answers || [])
      .find(q => q.question?.toLowerCase().includes('phone'))?.answer || '';
    return {
      id:               `cal_${ev.uri.split('/').pop()}`,
      first_name:       fn || '',
      last_name:        rest.join(' ') || '',
      email:            inv?.email  || '',
      phone,
      slot_start:       ev.start_time,
      slot_end:         ev.end_time,
      status:           'scheduled',
      investment_level: null,
      assigned_to_email: normalizeRepName(ev.event_memberships?.[0]?.user_email || null),
      meet_link:        ev.location?.join_url || null,
      created_at:       ev.created_at,
      event_name:       ev.name || '',
      booking_source:   'calendly',
      _source_display:  'Calendly',
      lead_score:       null,
      show_probability: null,
      health:           null,
      lead_status:      null,
      ghl_contact_id:   null,
      cq_sent_at:       null,
      cq_received_at:   null,
    };
  });

  // Note: GHL contact enrichment (liquid capital, owner name) is intentionally skipped here.
  // Doing per-event GHL lookups in parallel with fetchGHL() hits GHL rate limits and breaks
  // the calendar fetch. GHL enrichment happens lazily when the user opens the side panel.
  return base;
}

// ─── GoHighLevel Calendar ─────────────────────────────────────────────────────

const GHL_STATUS = {
  confirmed: 'scheduled', new: 'scheduled', booked: 'scheduled',
  showed:    'showed',    show: 'showed',
  noshow:    'no-show',   'no-show': 'no-show', no_show: 'no-show',
  cancelled: 'cancelled', canceled: 'cancelled', invalid: 'cancelled',
};

// Custom field IDs for liquid capital (either field works)
const LIQUID_CAPITAL_FIELD_IDS = new Set(['MquK4nPLhrQTUbvnHzTZ', '40JagvBXAiZeP1Ieepol']);

function getGHLLiquidCapital(contact) {
  if (!contact?.customFields) return null;
  const cf = contact.customFields.find(f => LIQUID_CAPITAL_FIELD_IDS.has(f.id));
  return cf?.value || null;
}

/**
 * Collapses rep name variants and email addresses to canonical names.
 * Handles GHL names ("S Sparks", "Steve"), Calendly emails ("ssparks@..."),
 * and Calendly user_name values ("ssparks", "john").
 */
function normalizeRepName(nameOrEmail) {
  if (!nameOrEmail) return nameOrEmail;
  const raw   = nameOrEmail.trim();
  // If it looks like an email, use only the local part for matching
  const check = raw.includes('@') ? raw.split('@')[0] : raw;
  const lc    = check.toLowerCase();
  // Steve Sparks variants
  if (/^(steve sparks?|s\.?\s*sparks?|steve)$/i.test(raw) || lc === 'ssparks' || lc === 'steve') return 'Steve Sparks';
  // John Doty variants
  if (/^(john doty|john|j\.?\s*doty)$/i.test(raw) || lc === 'john' || lc === 'jdoty') return 'John Doty';
  return raw;
}

async function fetchGHL(from, to) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return [];

  // Fetch both calendars in parallel, then deduplicate by event ID
  const calendarIds = [
    process.env.GHL_CALENDAR_ID   || DEFAULT_GHL_CALENDAR_ID,
    process.env.GHL_CALENDAR_ID_2  || DEFAULT_GHL_CALENDAR_ID_2,
  ];

  const fetchHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type':  'application/json',
    'Version':       GHL_VERSION,
  };

  const calResults = await Promise.allSettled(
    calendarIds.map(calendarId => {
      const params = new URLSearchParams({
        locationId, calendarId,
        startTime: String(from.getTime()),
        endTime:   String(to.getTime()),
      });
      return fetch(`${GHL_API}/calendars/events?${params}`, { headers: fetchHeaders })
        .then(r => {
          if (!r.ok) return r.text().then(txt => { throw new Error(`GHL ${calendarId} ${r.status}: ${txt.slice(0, 200)}`); });
          return r.json();
        });
    })
  );

  const seenIds = new Set();
  const events  = [];
  for (const result of calResults) {
    if (result.status === 'fulfilled') {
      for (const ev of (result.value.events || result.value.appointments || [])) {
        if (!seenIds.has(ev.id)) { seenIds.add(ev.id); events.push(ev); }
      }
    } else {
      console.error('[fetchGHL] calendar fetch failed:', result.reason?.message);
    }
  }

  const ghlHeaders = { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION };

  // Fetch each unique assigned user by ID (more reliable than the users list endpoint)
  const uniqueUserIds = [...new Set(events.map(ev => ev.assignedUserId).filter(Boolean))];
  const userMap = {};
  if (uniqueUserIds.length) {
    const userResults = await Promise.allSettled(
      uniqueUserIds.map(uid =>
        fetch(`${GHL_API}/users/${uid}`, { headers: ghlHeaders })
          .then(r => r.ok ? r.json() : null)
      )
    );
    uniqueUserIds.forEach((uid, i) => {
      const d = userResults[i].status === 'fulfilled' ? userResults[i].value : null;
      if (d) {
        const u = d.user || d; // handle both { user: {...} } and flat response
        const name = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
        if (name) userMap[uid] = name;
      }
    });
  }

  // Fetch full contact record in parallel — includes email, phone, customFields
  const contactResults = await Promise.allSettled(
    events.map(ev =>
      ev.contactId
        ? fetch(`${GHL_API}/contacts/${ev.contactId}`, { headers: ghlHeaders })
            .then(r => r.ok ? r.json() : null)
            .then(d => d?.contact ?? null)
        : Promise.resolve(null)
    )
  );

  return events.map((ev, i) => {
    const contact = contactResults[i].status === 'fulfilled' ? contactResults[i].value : null;

    // Title format is "First Last - Event Name" — parse name as fallback
    const titleParts = (ev.title || '').split(' - ');
    const titleName  = titleParts[0] || '';
    const eventName  = titleParts.slice(1).join(' - ') || ev.title || 'GHL Appointment';
    const [tfn, ...trest] = titleName.trim().split(' ');

    const rawStatus = (ev.appointmentStatus || ev.status || 'confirmed')
      .toLowerCase().replace(/\s+/g, '_');

    // Resolve assigned rep name — normalize variants to canonical names
    const assignedUserId   = ev.assignedUserId || null;
    const assignedUserName = assignedUserId
      ? normalizeRepName(userMap[assignedUserId] || null)
      : null;

    // Pull liquid capital from GHL custom fields
    const liquidCapital = getGHLLiquidCapital(contact);

    return {
      id:                `ghl_${ev.id}`,
      first_name:        contact?.firstName || tfn  || '',
      last_name:         contact?.lastName  || trest.join(' ') || '',
      email:             contact?.email     || '',
      phone:             contact?.phone     || '',
      slot_start:        ev.startTime || ev.start_time,
      slot_end:          ev.endTime   || ev.end_time,
      status:            GHL_STATUS[rawStatus] || 'scheduled',
      investment_level:  liquidCapital,
      assigned_to_email: assignedUserName,
      assigned_user_id:  ev.assignedUserId || null,
      meet_link:         null,
      created_at:        ev.dateAdded || ev.createdAt || null,
      event_name:        eventName,
      booking_source:    'gohighlevel',
      _source_display:   'GoHighLevel',
      lead_score:        null,
      show_probability:  null,
      health:            null,
      lead_status:       null,
      ghl_contact_id:    ev.contactId || contact?.id || null,
      cq_sent_at:        null,
      cq_received_at:    null,
    };
  });
}
