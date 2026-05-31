import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/analytics
 *
 * Returns aggregated funnel + performance data for the analytics dashboard.
 * Requires an active dashboard session.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  const [
    { data: leads },
    { data: bookings },
    { data: events },
  ] = await Promise.all([
    supabase.from('leads').select('id, status, created_at, fb_campaign_id, fb_adset_id, fb_ad_id, fb_form_id'),
    supabase.from('bookings').select('id, status, slot_start, assigned_to_email, investment_level, created_at, lead_score, show_probability'),
    supabase.from('events').select('event_type, session_id, lead_id, props, created_at').order('created_at', { ascending: false }).limit(5000),
  ]);

  const allLeads    = leads    || [];
  const allBookings = bookings || [];
  const allEvents   = events   || [];

  // ── Funnel counts ─────────────────────────────────────────────────────────
  const funnel = {
    leads:      allLeads.length,
    page_views: countEvents(allEvents, 'page_view'),
    booked:     allBookings.length,
    showed:     allBookings.filter(b => b.status === 'showed' || b.status === 'qualified').length,
    closed:     allBookings.filter(b => b.status === 'qualified').length,
  };

  // ── Lead quality / scoring ────────────────────────────────────────────────
  const healthDist = { green: 0, yellow: 0, red: 0 };
  let totalScore = 0, scoredCount = 0;
  allBookings.forEach(b => {
    const score = b.lead_score;
    const prob  = b.show_probability ?? 0;
    if (score != null) {
      totalScore += score;
      scoredCount++;
      if (score >= 70 && prob >= 70)      healthDist.green++;
      else if (score >= 45 || prob >= 55) healthDist.yellow++;
      else                                healthDist.red++;
    }
  });
  const avgLeadScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : null;

  // ── Recommendation acceptance ─────────────────────────────────────────────
  const recShown    = countEvents(allEvents, 'recommended_shown');
  const recAccepted = countEvents(allEvents, 'recommended_accepted');
  const recRejected = countEvents(allEvents, 'recommended_rejected');
  const recommendation = {
    shown:           recShown,
    accepted:        recAccepted,
    rejected:        recRejected,
    acceptance_rate: recShown > 0 ? Math.round((recAccepted / recShown) * 100) : 0,
  };

  // ── Calendar add clicks ───────────────────────────────────────────────────
  const calClicks = allEvents.filter(e => e.event_type === 'calendar_add_clicked');
  const calendarAdds = {
    google:  calClicks.filter(e => e.props?.provider === 'google').length,
    apple:   calClicks.filter(e => e.props?.provider === 'apple').length,
    outlook: calClicks.filter(e => e.props?.provider === 'outlook').length,
    total:   calClicks.length,
  };

  // ── Best days of week ─────────────────────────────────────────────────────
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowCounts = Array(7).fill(0);
  allBookings.forEach(b => {
    if (b.slot_start) dowCounts[new Date(b.slot_start).getDay()]++;
  });
  const bestDays = DOW.map((name, i) => ({ day: name, bookings: dowCounts[i] }))
    .sort((a, b) => b.bookings - a.bookings);

  // ── Best hours ────────────────────────────────────────────────────────────
  const hourCounts = Array(24).fill(0);
  allBookings.forEach(b => {
    if (b.slot_start) hourCounts[new Date(b.slot_start).getHours()]++;
  });
  const bestHours = hourCounts
    .map((count, h) => ({ hour: h, label: fmtHour(h), bookings: count }))
    .filter(h => h.bookings > 0)
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 8);

  // ── Rep performance ───────────────────────────────────────────────────────
  const repMap = {};
  allBookings.forEach(b => {
    const email = b.assigned_to_email || 'Unassigned';
    if (!repMap[email]) repMap[email] = { email, booked: 0, showed: 0 };
    repMap[email].booked++;
    if (b.status === 'showed' || b.status === 'qualified') repMap[email].showed++;
  });
  const repStats = Object.values(repMap).sort((a, b) => b.booked - a.booked);

  // ── Time-to-book ──────────────────────────────────────────────────────────
  const sessionFirstView = {};
  allEvents.filter(e => e.event_type === 'page_view').forEach(e => {
    const t = new Date(e.created_at).getTime();
    if (!sessionFirstView[e.session_id] || t < sessionFirstView[e.session_id]) {
      sessionFirstView[e.session_id] = t;
    }
  });
  const bookingTimes = [];
  allEvents.filter(e => e.event_type === 'booking_completed').forEach(e => {
    const viewTime = sessionFirstView[e.session_id];
    if (viewTime) {
      const mins = (new Date(e.created_at).getTime() - viewTime) / 60000;
      if (mins >= 0 && mins < 120) bookingTimes.push(mins);
    }
  });
  const avgTimeToBook = bookingTimes.length
    ? Math.round(bookingTimes.reduce((a, b) => a + b, 0) / bookingTimes.length)
    : null;

  return res.json({
    funnel,
    healthDist,
    avgLeadScore,
    recommendation,
    calendarAdds,
    bestDays,
    bestHours,
    repStats,
    avgTimeToBook,
    totalEvents: allEvents.length,
  });
}

function countEvents(events, type) {
  return events.filter(e => e.event_type === type).length;
}

function fmtHour(h) {
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}
