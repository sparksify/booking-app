import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/analytics
 *
 * Returns aggregated decision-metric data for the intelligence dashboard.
 * Pulls from: bookings, leads, lead_events
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  const [
    { data: leads },
    { data: bookings },
    { data: leadEvents },
  ] = await Promise.all([
    supabase
      .from('leads')
      .select('id, status, created_at, email'),
    supabase
      .from('bookings')
      .select('id, status, slot_start, assigned_to_email, investment_level, created_at, lead_score, show_probability, booking_source, email, first_name, last_name'),
    supabase
      .from('lead_events')
      .select('email, event_type, event_data, created_at')
      .in('event_type', [
        'booking_page_viewed',
        'recommended_slot_shown',
        'recommended_slot_accepted',
        'recommended_slot_rejected',
        'calendar_add_clicked',
      ])
      .order('created_at', { ascending: false })
      .limit(10000),
  ]);

  const allLeads    = leads      || [];
  const allBookings = bookings   || [];
  const allEvents   = leadEvents || [];

  // ── Helper ─────────────────────────────────────────────────────────────────
  const showed  = b => ['showed', 'closed'].includes(b.status);
  const closed  = b => b.status === 'closed';

  // ── Build email → bookings index ───────────────────────────────────────────
  const bookingsByEmail = {};
  allBookings.forEach(b => {
    if (!b.email) return;
    if (!bookingsByEmail[b.email]) bookingsByEmail[b.email] = [];
    bookingsByEmail[b.email].push(b);
  });

  // ── 6-step funnel ─────────────────────────────────────────────────────────
  const pageViewedEmails = new Set(
    allEvents.filter(e => e.event_type === 'booking_page_viewed').map(e => e.email).filter(Boolean)
  );
  const funnel = {
    leads:       allLeads.length,
    page_viewed: pageViewedEmails.size,
    booked:      allBookings.length,
    showed:      allBookings.filter(showed).length,
    closed:      allBookings.filter(closed).length,
  };

  const bookingRate = funnel.leads   > 0 ? Math.round((funnel.booked  / funnel.leads)   * 100) : 0;
  const showRate    = funnel.booked  > 0 ? Math.round((funnel.showed  / funnel.booked)  * 100) : 0;
  const closeRate   = funnel.showed  > 0 ? Math.round((funnel.closed  / funnel.showed)  * 100) : 0;

  // ── Lead quality / scoring ─────────────────────────────────────────────────
  const healthDist = { green: 0, yellow: 0, red: 0 };
  let totalScore = 0, scoredCount = 0;
  allBookings.forEach(b => {
    const score = b.lead_score;
    const prob  = b.show_probability ?? 0;
    if (score != null) {
      totalScore += score; scoredCount++;
      if (score >= 70 && prob >= 70)      healthDist.green++;
      else if (score >= 45 || prob >= 55) healthDist.yellow++;
      else                                healthDist.red++;
    }
  });
  const avgLeadScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : null;

  // ── Recommendation engine ──────────────────────────────────────────────────
  const recShown    = allEvents.filter(e => e.event_type === 'recommended_slot_shown').length;
  const recAccepted = allEvents.filter(e => e.event_type === 'recommended_slot_accepted').length;
  const recRejected = allEvents.filter(e => e.event_type === 'recommended_slot_rejected').length;

  const acceptedEmails = new Set(allEvents.filter(e => e.event_type === 'recommended_slot_accepted').map(e => e.email).filter(Boolean));
  const rejectedEmails = new Set(allEvents.filter(e => e.event_type === 'recommended_slot_rejected').map(e => e.email).filter(Boolean));

  function emailSetShowRate(emailSet) {
    let total = 0, sh = 0;
    emailSet.forEach(email => {
      const bks = bookingsByEmail[email] || [];
      total += bks.length;
      sh    += bks.filter(showed).length;
    });
    return total > 0 ? Math.round((sh / total) * 100) : null;
  }

  const recommendation = {
    shown:              recShown,
    accepted:           recAccepted,
    rejected:           recRejected,
    acceptance_rate:    recShown > 0 ? Math.round((recAccepted / recShown) * 100) : 0,
    show_rate_accepted: emailSetShowRate(acceptedEmails),
    show_rate_rejected: emailSetShowRate(rejectedEmails),
  };

  // ── Calendar add vs show rate ──────────────────────────────────────────────
  const calEvents   = allEvents.filter(e => e.event_type === 'calendar_add_clicked');
  const calAddEmails = new Set(calEvents.map(e => e.email).filter(Boolean));

  let calAdded    = { booked: 0, showed: 0 };
  let calNotAdded = { booked: 0, showed: 0 };
  allBookings.forEach(b => {
    if (!b.email) return;
    const bucket = calAddEmails.has(b.email) ? calAdded : calNotAdded;
    bucket.booked++;
    if (showed(b)) bucket.showed++;
  });

  const calendarAdds = {
    total:               calEvents.length,
    google:              calEvents.filter(e => e.event_data?.provider === 'google').length,
    apple:               calEvents.filter(e => e.event_data?.provider === 'apple').length,
    outlook:             calEvents.filter(e => e.event_data?.provider === 'outlook').length,
    show_rate_added:     calAdded.booked    > 0 ? Math.round((calAdded.showed    / calAdded.booked)    * 100) : null,
    show_rate_not_added: calNotAdded.booked > 0 ? Math.round((calNotAdded.showed / calNotAdded.booked) * 100) : null,
    added_count:         calAdded.booked,
    not_added_count:     calNotAdded.booked,
  };

  // ── Slot leaderboard ───────────────────────────────────────────────────────
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const slotMap = {};
  allBookings.forEach(b => {
    if (!b.slot_start) return;
    const d   = new Date(b.slot_start);
    const key = `${DOW[d.getDay()]} ${fmtHour(d.getHours())}`;
    if (!slotMap[key]) slotMap[key] = { slot: key, booked: 0, showed: 0, closed: 0 };
    slotMap[key].booked++;
    if (showed(b)) slotMap[key].showed++;
    if (closed(b)) slotMap[key].closed++;
  });
  const slotLeaderboard = Object.values(slotMap)
    .map(s => ({ ...s, show_rate: s.booked > 0 ? Math.round((s.showed / s.booked) * 100) : null }))
    .sort((a, b) => b.booked - a.booked)
    .slice(0, 8);

  // ── Best days / hours (for heat bars) ─────────────────────────────────────
  const dowCounts  = Array(7).fill(0);
  const hourCounts = Array(24).fill(0);
  allBookings.forEach(b => {
    if (!b.slot_start) return;
    dowCounts[new Date(b.slot_start).getDay()]++;
    hourCounts[new Date(b.slot_start).getHours()]++;
  });
  const bestDays  = DOW.map((name, i) => ({ day: name, bookings: dowCounts[i] }))
    .sort((a, b) => b.bookings - a.bookings);
  const bestHours = hourCounts
    .map((count, h) => ({ hour: h, label: fmtHour(h), bookings: count }))
    .filter(h => h.bookings > 0)
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 8);

  // ── Appointment delay analysis ─────────────────────────────────────────────
  const DELAY_BUCKETS = [
    { key: 'Same Day',  test: d => d <= 0  },
    { key: '1 Day',     test: d => d === 1 },
    { key: '2 Days',    test: d => d === 2 },
    { key: '3–7 Days',  test: d => d >= 3  && d <= 7  },
    { key: '8–14 Days', test: d => d >= 8  && d <= 14 },
    { key: '14+ Days',  test: d => d > 14  },
  ];
  const delayMap = Object.fromEntries(DELAY_BUCKETS.map(b => [b.key, { label: b.key, booked: 0, showed: 0 }]));
  allBookings.forEach(b => {
    if (!b.slot_start || !b.created_at) return;
    const days = Math.floor((new Date(b.slot_start) - new Date(b.created_at)) / 86400000);
    const def  = DELAY_BUCKETS.find(d => d.test(days));
    if (def) {
      delayMap[def.key].booked++;
      if (showed(b)) delayMap[def.key].showed++;
    }
  });
  const delayAnalysis = DELAY_BUCKETS.map(d => ({
    ...delayMap[d.key],
    show_rate: delayMap[d.key].booked > 0 ? Math.round((delayMap[d.key].showed / delayMap[d.key].booked) * 100) : null,
  }));

  // ── Attribution by booking source ──────────────────────────────────────────
  const SOURCE_LABELS = {
    direct:       'Direct',
    facebook_lead:'Facebook Lead',
    closebot:     'CloseBot',
    sms:          'SMS Recovery',
    email:        'Email Recovery',
    retargeting:  'Retargeting',
  };
  const srcMap = {};
  allBookings.forEach(b => {
    const src = b.booking_source || 'direct';
    if (!srcMap[src]) srcMap[src] = { source: src, label: SOURCE_LABELS[src] || src, booked: 0, showed: 0, closed: 0 };
    srcMap[src].booked++;
    if (showed(b)) srcMap[src].showed++;
    if (closed(b)) srcMap[src].closed++;
  });
  const attribution = Object.values(srcMap)
    .map(s => ({ ...s, show_rate: s.booked > 0 ? Math.round((s.showed / s.booked) * 100) : null }))
    .sort((a, b) => b.booked - a.booked);

  // ── Booking velocity (page_viewed → booking created_at) ────────────────────
  const firstViewByEmail = {};
  allEvents.filter(e => e.event_type === 'booking_page_viewed').forEach(e => {
    if (!e.email) return;
    const t = new Date(e.created_at).getTime();
    if (!firstViewByEmail[e.email] || t < firstViewByEmail[e.email]) {
      firstViewByEmail[e.email] = t;
    }
  });

  const VEL_BUCKETS = [
    { key: '<5 min',   test: m => m < 5 },
    { key: '5–30 min', test: m => m >= 5   && m < 30   },
    { key: '1–24 hrs', test: m => m >= 30  && m < 1440 },
    { key: '>24 hrs',  test: m => m >= 1440 },
  ];
  const velMap  = Object.fromEntries(VEL_BUCKETS.map(b => [b.key, { label: b.key, booked: 0, showed: 0 }]));
  const velMins = [];

  allBookings.forEach(b => {
    if (!b.email || !b.created_at) return;
    const viewTime = firstViewByEmail[b.email];
    if (!viewTime) return;
    const mins = (new Date(b.created_at).getTime() - viewTime) / 60000;
    if (mins < 0 || mins > 43200) return;
    velMins.push(mins);
    const def = VEL_BUCKETS.find(d => d.test(mins));
    if (def) {
      velMap[def.key].booked++;
      if (showed(b)) velMap[def.key].showed++;
    }
  });

  const sortedMins = [...velMins].sort((a, b) => a - b);
  const velocityStats = sortedMins.length > 0 ? {
    avg:    Math.round(sortedMins.reduce((a, b) => a + b, 0) / sortedMins.length),
    median: Math.round(sortedMins[Math.floor(sortedMins.length / 2)]),
    min:    Math.round(sortedMins[0]),
    max:    Math.round(sortedMins[sortedMins.length - 1]),
    count:  sortedMins.length,
  } : null;

  const velocityAnalysis = VEL_BUCKETS.map(d => ({
    ...velMap[d.key],
    show_rate: velMap[d.key].booked > 0 ? Math.round((velMap[d.key].showed / velMap[d.key].booked) * 100) : null,
  }));

  // ── Rep performance ────────────────────────────────────────────────────────
  const repMap = {};
  allBookings.forEach(b => {
    const email = b.assigned_to_email || 'Unassigned';
    if (!repMap[email]) repMap[email] = { email, booked: 0, showed: 0, closed: 0 };
    repMap[email].booked++;
    if (showed(b)) repMap[email].showed++;
    if (closed(b)) repMap[email].closed++;
  });
  const repStats = Object.values(repMap).sort((a, b) => b.booked - a.booked);

  // ── Avg time to book (lead created → booking created) ─────────────────────
  const leadByEmail = {};
  allLeads.forEach(l => { if (l.email) leadByEmail[l.email] = l; });
  const ttbMins = [];
  allBookings.forEach(b => {
    if (!b.email || !b.created_at) return;
    const lead = leadByEmail[b.email];
    if (!lead?.created_at) return;
    const mins = (new Date(b.created_at) - new Date(lead.created_at)) / 60000;
    if (mins >= 0 && mins < 43200) ttbMins.push(mins);
  });
  const avgTimeToBook = ttbMins.length > 0
    ? Math.round(ttbMins.reduce((a, b) => a + b, 0) / ttbMins.length)
    : null;

  return res.json({
    funnel,
    bookingRate,
    showRate,
    closeRate,
    avgTimeToBook,
    healthDist,
    avgLeadScore,
    recommendation,
    calendarAdds,
    bestDays,
    bestHours,
    slotLeaderboard,
    delayAnalysis,
    attribution,
    velocityStats,
    velocityAnalysis,
    repStats,
  });
}

function fmtHour(h) {
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}
