import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { computeLeadScore, computeShowProbability, getHealthBadge } from '@/lib/scoring';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const CAL_API     = 'https://api.calendly.com';
// Known user URI — override via CALENDLY_USER_URI env var if the account ever changes
const DEFAULT_CAL_USER = 'https://api.calendly.com/users/c59a21b9-aa46-45a7-8e8a-3e2faa614742';

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
    from = new Date(now); from.setHours(0, 0, 0, 0);
    to   = new Date(now); to.setHours(23, 59, 59, 999);
  } else if (filter === 'tomorrow') {
    from = new Date(now); from.setDate(from.getDate() + 1); from.setHours(0, 0, 0, 0);
    to   = new Date(from); to.setHours(23, 59, 59, 999);
  } else if (filter === 'week') {
    from = new Date(now); from.setHours(0, 0, 0, 0);
    to   = new Date(from); to.setDate(from.getDate() + 13); to.setHours(23, 59, 59, 999);
  } else {
    // 'all': last 30 days → next 60 days
    from = new Date(now); from.setDate(from.getDate() - 30); from.setHours(0, 0, 0, 0);
    to   = new Date(now); to.setDate(to.getDate()   + 60);  to.setHours(23, 59, 59, 999);
  }

  // ── Fetch all three sources in parallel ──────────────────────────────────
  const [sbRes, calRes, ghlRes] = await Promise.allSettled([
    fetchSupabase(supabase, from, to),
    fetchCalendly(from, to),
    fetchGHL(from, to),
  ]);

  if (sbRes.status  === 'rejected') console.error('[bookings] supabase:', sbRes.reason?.message);
  if (calRes.status === 'rejected') console.error('[bookings] calendly:', calRes.reason?.message);
  if (ghlRes.status === 'rejected') console.error('[bookings] ghl:',     ghlRes.reason?.message);

  const rawSB  = sbRes.status  === 'fulfilled' ? sbRes.value  : [];
  const calBks = calRes.status === 'fulfilled' ? calRes.value : [];
  const ghlBks = ghlRes.status === 'fulfilled' ? ghlRes.value : [];

  // Enrich Supabase bookings with lead status
  const emails = [...new Set(rawSB.map(b => b.email).filter(Boolean))];
  let leadsByEmail = {};
  if (emails.length) {
    const { data: leads } = await supabase
      .from('leads').select('email, status, ghl_contact_id').in('email', emails);
    (leads || []).forEach(l => { leadsByEmail[l.email] = l; });
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
      _source_display:  'FranchiseBook',
    };
  });

  // Merge + filter test emails + sort by slot_start ascending
  const all = [...sbBks, ...calBks, ...ghlBks]
    .filter(b => !TEST_EMAILS.has((b.email || '').toLowerCase()))
    .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime());

  res.json({ bookings: all });
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

  const userUri = process.env.CALENDLY_USER_URI || DEFAULT_CAL_USER;
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  const params = new URLSearchParams({
    user:           userUri,
    status:         'active',
    count:          '100',
    sort:           'start_time:asc',
    min_start_time: from.toISOString(),
    max_start_time: to.toISOString(),
  });

  const evRes = await fetch(`${CAL_API}/scheduled_events?${params}`, { headers });
  if (!evRes.ok) {
    const txt = await evRes.text();
    throw new Error(`Calendly events ${evRes.status}: ${txt.slice(0, 200)}`);
  }

  const { collection: events = [] } = await evRes.json();

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

  return events.map((ev, i) => {
    const inv = invResults[i].status === 'fulfilled' ? invResults[i].value : null;
    const fullName = inv?.name || '';
    const [fn, ...rest] = fullName.split(' ');

    // Phone sometimes comes through Calendly's questions_and_answers
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
      assigned_to_email: null,
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
}

// ─── GoHighLevel Calendar ─────────────────────────────────────────────────────

const GHL_STATUS = {
  confirmed: 'scheduled', new: 'scheduled', booked: 'scheduled',
  showed:    'showed',    show: 'showed',
  noshow:    'no-show',   'no-show': 'no-show', no_show: 'no-show',
  cancelled: 'cancelled', canceled: 'cancelled', invalid: 'cancelled',
};

async function fetchGHL(from, to) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return [];

  const params = new URLSearchParams({
    locationId,
    startTime: String(from.getTime()),
    endTime:   String(to.getTime()),
  });

  const r = await fetch(`${GHL_API}/calendars/events?${params}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       GHL_VERSION,
    },
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`GHL calendar ${r.status}: ${txt.slice(0, 200)}`);
  }

  const data   = await r.json();
  const events = data.events || data.appointments || [];

  return events.map(ev => {
    const contact   = ev.contact || {};
    const rawStatus = (ev.appointmentStatus || ev.status || 'confirmed')
      .toLowerCase().replace(/\s+/g, '_');

    return {
      id:               `ghl_${ev.id}`,
      first_name:       contact.firstName || '',
      last_name:        contact.lastName  || '',
      email:            contact.email     || ev.email || '',
      phone:            contact.phone     || ev.phone || '',
      slot_start:       ev.startTime || ev.start_time,
      slot_end:         ev.endTime   || ev.end_time,
      status:           GHL_STATUS[rawStatus] || 'scheduled',
      investment_level: null,
      assigned_to_email: null,
      meet_link:        null,
      created_at:       ev.dateAdded || ev.createdAt || null,
      event_name:       ev.title || 'GHL Appointment',
      booking_source:   'gohighlevel',
      _source_display:  'GoHighLevel',
      lead_score:       null,
      show_probability: null,
      health:           null,
      lead_status:      null,
      ghl_contact_id:   ev.contactId || contact.id || null,
      cq_sent_at:       null,
      cq_received_at:   null,
    };
  });
}
