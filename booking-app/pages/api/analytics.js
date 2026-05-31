import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/analytics
 *
 * Returns all data needed for the 12-section intelligence dashboard.
 * Pulls from: settings, bookings, leads, lead_events
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  const [
    { data: settingsRow },
    { data: leads },
    { data: bookings },
    { data: leadEvents },
  ] = await Promise.all([
    supabase.from('settings').select('revenue_per_close').eq('id', 1).single(),
    supabase.from('leads').select('id, status, created_at, email, fb_lead_id'),
    supabase.from('bookings').select('id, status, slot_start, assigned_to_email, investment_level, created_at, lead_score, show_probability, booking_source, email, first_name, last_name'),
    supabase.from('lead_events')
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
  const rpc         = settingsRow?.revenue_per_close ?? 0;   // revenue per close

  // ── Status helpers ─────────────────────────────────────────────────────────
  const isShowed = b => ['showed', 'closed'].includes(b.status);
  const isClosed = b => b.status === 'closed';

  // ── Email → bookings index ─────────────────────────────────────────────────
  const bookingsByEmail = {};
  allBookings.forEach(b => {
    if (!b.email) return;
    (bookingsByEmail[b.email] ??= []).push(b);
  });

  // ── §1 Funnel + top-line rates ─────────────────────────────────────────────
  const pageViewedEmails = new Set(
    allEvents.filter(e => e.event_type === 'booking_page_viewed').map(e => e.email).filter(Boolean)
  );
  const funnel = {
    leads:       allLeads.length,
    page_viewed: pageViewedEmails.size,
    booked:      allBookings.length,
    showed:      allBookings.filter(isShowed).length,
    closed:      allBookings.filter(isClosed).length,
  };
  const bookingRate = funnel.leads   > 0 ? Math.round((funnel.booked  / funnel.leads)   * 100) : 0;
  const showRate    = funnel.booked  > 0 ? Math.round((funnel.showed  / funnel.booked)  * 100) : 0;
  const closeRate   = funnel.showed  > 0 ? Math.round((funnel.closed  / funnel.showed)  * 100) : 0;

  // ── §1 Revenue metrics ─────────────────────────────────────────────────────
  const revGenerated      = funnel.closed * rpc;
  const revPerAppt        = funnel.booked  > 0 ? Math.round(revGenerated / funnel.booked)  : 0;
  const revPerLead        = funnel.leads   > 0 ? Math.round(revGenerated / funnel.leads)   : 0;
  const lostLeads         = funnel.leads - funnel.booked;
  const revLost           = lostLeads > 0 ? lostLeads * revPerLead : 0;
  const revenue = { per_close: rpc, generated: revGenerated, per_appt: revPerAppt, per_lead: revPerLead, lost: revLost };

  // ── §2 Recommendation engine ───────────────────────────────────────────────
  const recShown    = allEvents.filter(e => e.event_type === 'recommended_slot_shown').length;
  const recAccepted = allEvents.filter(e => e.event_type === 'recommended_slot_accepted').length;
  const recRejected = allEvents.filter(e => e.event_type === 'recommended_slot_rejected').length;
  const accEmails   = new Set(allEvents.filter(e => e.event_type === 'recommended_slot_accepted').map(e => e.email).filter(Boolean));
  const rejEmails   = new Set(allEvents.filter(e => e.event_type === 'recommended_slot_rejected').map(e => e.email).filter(Boolean));

  function emailSetShowRate(set) {
    let tot = 0, sh = 0;
    set.forEach(email => {
      const bks = bookingsByEmail[email] || [];
      tot += bks.length;
      sh  += bks.filter(isShowed).length;
    });
    return tot > 0 ? Math.round((sh / tot) * 100) : null;
  }

  const recommendation = {
    shown:              recShown,
    accepted:           recAccepted,
    rejected:           recRejected,
    acceptance_rate:    recShown > 0 ? Math.round((recAccepted / recShown) * 100) : 0,
    show_rate_accepted: emailSetShowRate(accEmails),
    show_rate_rejected: emailSetShowRate(rejEmails),
  };

  // ── §3 Slot leaderboard (with revenue) ────────────────────────────────────
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const slotMap = {};
  allBookings.forEach(b => {
    if (!b.slot_start) return;
    const d   = new Date(b.slot_start);
    const key = `${DOW[d.getDay()]} ${fmtHour(d.getHours())}`;
    const s   = slotMap[key] ??= { slot: key, booked: 0, showed: 0, closed: 0 };
    s.booked++;
    if (isShowed(b)) s.showed++;
    if (isClosed(b)) s.closed++;
  });
  const slotLeaderboard = Object.values(slotMap)
    .map(s => ({ ...s, show_rate: s.booked > 0 ? Math.round((s.showed / s.booked) * 100) : null, revenue: s.closed * rpc }))
    .sort((a, b) => b.booked - a.booked)
    .slice(0, 8);

  // ── §5 Attribution — booking source ───────────────────────────────────────
  const SOURCE_LABELS = { direct: 'Direct', facebook_lead: 'Facebook Lead', closebot: 'CloseBot', sms: 'SMS Recovery', email: 'Email Recovery', retargeting: 'Retargeting' };
  const srcMap = {};
  allBookings.forEach(b => {
    const src = b.booking_source || 'direct';
    const s   = srcMap[src] ??= { source: src, label: SOURCE_LABELS[src] || src, booked: 0, showed: 0, closed: 0 };
    s.booked++;
    if (isShowed(b)) s.showed++;
    if (isClosed(b)) s.closed++;
  });
  const attribution = Object.values(srcMap)
    .map(s => ({ ...s, show_rate: s.booked > 0 ? Math.round((s.showed / s.booked) * 100) : null }))
    .sort((a, b) => b.booked - a.booked);

  // ── §5 Lead source (Facebook vs Direct) ───────────────────────────────────
  const fbEmails     = new Set(allLeads.filter(l => l.fb_lead_id).map(l => l.email).filter(Boolean));
  const directEmails = new Set(allLeads.filter(l => !l.fb_lead_id).map(l => l.email).filter(Boolean));

  function leadSourceStats(emailSet, leadFilter) {
    let booked = 0, showed = 0;
    allBookings.forEach(b => {
      if (!b.email || !emailSet.has(b.email)) return;
      booked++;
      if (isShowed(b)) showed++;
    });
    return { leads: leadFilter(allLeads).length, booked, showed };
  }

  const leadSource = [
    { source: 'facebook', label: 'Facebook', ...leadSourceStats(fbEmails, ls => ls.filter(l => l.fb_lead_id)) },
    { source: 'direct',   label: 'Direct',   ...leadSourceStats(directEmails, ls => ls.filter(l => !l.fb_lead_id)) },
  ].filter(s => s.leads > 0);

  // ── §6 Consultant performance ──────────────────────────────────────────────
  const repMap = {};
  allBookings.forEach(b => {
    const email = b.assigned_to_email || 'Unassigned';
    const r     = repMap[email] ??= { email, booked: 0, showed: 0, closed: 0 };
    r.booked++;
    if (isShowed(b)) r.showed++;
    if (isClosed(b)) r.closed++;
  });
  const repStats = Object.values(repMap)
    .map(r => ({ ...r, revenue: r.closed * rpc }))
    .sort((a, b) => b.revenue - a.revenue || b.closed - a.closed);
  if (repStats.length > 0) repStats[0].top_performer = true;

  // ── §7 Booking velocity ────────────────────────────────────────────────────
  const firstViewByEmail = {};
  allEvents.filter(e => e.event_type === 'booking_page_viewed').forEach(e => {
    if (!e.email) return;
    const t = new Date(e.created_at).getTime();
    if (!firstViewByEmail[e.email] || t < firstViewByEmail[e.email]) firstViewByEmail[e.email] = t;
  });
  const VEL = [
    { key: '<5 min',   test: m => m < 5 },
    { key: '5–30 min', test: m => m >= 5   && m < 30   },
    { key: '1–24 hrs', test: m => m >= 30  && m < 1440 },
    { key: '>24 hrs',  test: m => m >= 1440 },
  ];
  const velMap  = Object.fromEntries(VEL.map(d => [d.key, { label: d.key, booked: 0, showed: 0 }]));
  const velMins = [];
  allBookings.forEach(b => {
    if (!b.email || !b.created_at) return;
    const vt = firstViewByEmail[b.email];
    if (!vt) return;
    const mins = (new Date(b.created_at).getTime() - vt) / 60000;
    if (mins < 0 || mins > 43200) return;
    velMins.push(mins);
    const def = VEL.find(d => d.test(mins));
    if (def) { velMap[def.key].booked++; if (isShowed(b)) velMap[def.key].showed++; }
  });
  const sorted = [...velMins].sort((a, b) => a - b);
  const velocityStats = sorted.length > 0 ? {
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    median: Math.round(sorted[Math.floor(sorted.length / 2)]),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
  } : null;
  const velocityAnalysis = VEL.map(d => ({
    ...velMap[d.key],
    show_rate: velMap[d.key].booked > 0 ? Math.round((velMap[d.key].showed / velMap[d.key].booked) * 100) : null,
  }));

  // ── §8 Appointment delay ───────────────────────────────────────────────────
  const DELAY = [
    { key: 'Same Day',  test: d => d <= 0  },
    { key: '1 Day',     test: d => d === 1 },
    { key: '2 Days',    test: d => d === 2 },
    { key: '3–7 Days',  test: d => d >= 3  && d <= 7  },
    { key: '8–14 Days', test: d => d >= 8  && d <= 14 },
    { key: '14+ Days',  test: d => d > 14  },
  ];
  const delayMap = Object.fromEntries(DELAY.map(d => [d.key, { label: d.key, booked: 0, showed: 0 }]));
  allBookings.forEach(b => {
    if (!b.slot_start || !b.created_at) return;
    const days = Math.floor((new Date(b.slot_start) - new Date(b.created_at)) / 86400000);
    const def  = DELAY.find(d => d.test(days));
    if (def) { delayMap[def.key].booked++; if (isShowed(b)) delayMap[def.key].showed++; }
  });
  const delayAnalysis = DELAY.map(d => ({
    ...delayMap[d.key],
    show_rate: delayMap[d.key].booked > 0 ? Math.round((delayMap[d.key].showed / delayMap[d.key].booked) * 100) : null,
  }));

  // ── §9 Calendar add vs show rate ───────────────────────────────────────────
  const calEvents    = allEvents.filter(e => e.event_type === 'calendar_add_clicked');
  const calAddEmails = new Set(calEvents.map(e => e.email).filter(Boolean));
  let calAdded = { booked: 0, showed: 0 }, calNot = { booked: 0, showed: 0 };
  allBookings.forEach(b => {
    if (!b.email) return;
    const bucket = calAddEmails.has(b.email) ? calAdded : calNot;
    bucket.booked++;
    if (isShowed(b)) bucket.showed++;
  });
  const calendarAdds = {
    total:               calEvents.length,
    google:              calEvents.filter(e => e.event_data?.provider === 'google').length,
    apple:               calEvents.filter(e => e.event_data?.provider === 'apple').length,
    outlook:             calEvents.filter(e => e.event_data?.provider === 'outlook').length,
    show_rate_added:     calAdded.booked > 0 ? Math.round((calAdded.showed / calAdded.booked) * 100) : null,
    show_rate_not_added: calNot.booked   > 0 ? Math.round((calNot.showed   / calNot.booked)   * 100) : null,
    added_count:         calAdded.booked,
    not_added_count:     calNot.booked,
  };

  // ── §10 Revenue intelligence ───────────────────────────────────────────────
  const dowClosedCount  = Array(7).fill(0);
  const hourClosedCount = Array(24).fill(0);
  const dowAllCount     = Array(7).fill(0);
  const hourAllCount    = Array(24).fill(0);
  allBookings.forEach(b => {
    if (!b.slot_start) return;
    const d = new Date(b.slot_start);
    dowAllCount[d.getDay()]++;
    hourAllCount[d.getHours()]++;
    if (isClosed(b)) { dowClosedCount[d.getDay()]++; hourClosedCount[d.getHours()]++; }
  });
  const revenueByDay  = DOW.map((day, i) => ({ day, revenue: dowClosedCount[i] * rpc, bookings: dowAllCount[i] }))
    .filter(d => d.bookings > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const revenueByHour = hourClosedCount
    .map((cl, h) => ({ label: fmtHour(h), revenue: cl * rpc, bookings: hourAllCount[h] }))
    .filter(h => h.bookings > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // ── §11 Lead quality ───────────────────────────────────────────────────────
  const healthDist = { green: 0, yellow: 0, red: 0 };
  let totalScore = 0, scoredCount = 0;
  allBookings.forEach(b => {
    const score = b.lead_score, prob = b.show_probability ?? 0;
    if (score != null) {
      totalScore += score; scoredCount++;
      if (score >= 70 && prob >= 70)      healthDist.green++;
      else if (score >= 45 || prob >= 55) healthDist.yellow++;
      else                                healthDist.red++;
    }
  });
  const avgLeadScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : null;

  // ── Avg time to book (lead → booking) ─────────────────────────────────────
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
    ? Math.round(ttbMins.reduce((a, b) => a + b, 0) / ttbMins.length) : null;

  return res.json({
    funnel, bookingRate, showRate, closeRate, avgTimeToBook,
    revenue,
    recommendation,
    slotLeaderboard,
    attribution, leadSource,
    repStats,
    velocityStats, velocityAnalysis,
    delayAnalysis,
    calendarAdds,
    revenueByDay, revenueByHour,
    healthDist, avgLeadScore,
  });
}

function fmtHour(h) {
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}
