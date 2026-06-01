import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/prospects
 *
 * Returns scored leads bucketed into 8 revenue opportunity categories,
 * plus hero aggregate stats for the mission control header.
 *
 * Buckets (priority order — a lead is only in one):
 *   saves        — no-show within 7 days, not subsequently closed           (22% conv)
 *   speed_to_lead— submitted < 6h ago, zero contact attempts               (35% conv)
 *   vip          — $250k+ liquid AND recent engagement or page views        (20% conv)
 *   re_engaged   — activity in last 24h, lead > 6h old, not resurrection   (25% conv)
 *   near_miss    — had a booking, no-showed >7d ago, never rescheduled     (15% conv)
 *   resurrection — 90+ days old + recent engagement                         (12% conv)
 *   high_dollar  — investment >= $250k, no active booking                  (10% conv)
 *   hot          — everything else with final score >= 12                    (8% conv)
 *
 * Commission estimate = revenue_per_close × bucket conversion rate
 * Hero = { totalOpportunity, recoverableAppointments, totalLeads, topLead }
 */

const CONVERSION_RATES = {
  saves:         0.22,
  speed_to_lead: 0.35,
  vip:           0.20,
  re_engaged:    0.25,
  near_miss:     0.15,
  resurrection:  0.12,
  high_dollar:   0.10,
  hot:           0.08,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  // Revenue per close for commission estimates
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('revenue_per_close')
    .single();
  const revenuePerClose = settingsRow?.revenue_per_close || 15000;

  // ── 1. Fetch leads (no status filter — NULL != 'closed' is NULL in Postgres) ──
  const { data: rawLeads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, phone, created_at, score, status, investment_level, raw_fields, ghl_contact_id, location_city, location_state, location_zip')
    .order('created_at', { ascending: false })
    .limit(500);

  if (leadsErr || !rawLeads || rawLeads.length === 0) {
    return res.json({ leads: [], buckets: {}, hero: null });
  }

  const leadIds = rawLeads.map(l => l.id);

  // ── 2. Fetch bookings + events in parallel ────────────────────────────────
  const [{ data: allBookings }, { data: allEvents }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, lead_id, status, slot_start, cq_sent_at, cq_received_at, assigned_to_email')
      .in('lead_id', leadIds)
      .order('slot_start', { ascending: false }),
    supabase
      .from('lead_events')
      .select('lead_id, event_type, created_at, metadata')
      .in('lead_id', leadIds)
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const bookingsByLead = {};
  const eventsByLead   = {};
  for (const b of allBookings || []) {
    if (!bookingsByLead[b.lead_id]) bookingsByLead[b.lead_id] = [];
    bookingsByLead[b.lead_id].push(b);
  }
  for (const e of allEvents || []) {
    if (!eventsByLead[e.lead_id]) eventsByLead[e.lead_id] = [];
    eventsByLead[e.lead_id].push(e);
  }

  // ── 3. Score + bucket each lead ───────────────────────────────────────────
  const SEVEN_DAYS = 7  * 24 * 60 * 60 * 1000;
  const ONE_DAY    = 24 * 60 * 60 * 1000;
  const SIX_HOURS  = 6  * 60 * 60 * 1000;
  const now = Date.now();

  const scoredLeads = rawLeads.map(lead => {
    const bookings = bookingsByLead[lead.id] || [];
    const events   = eventsByLead[lead.id]   || [];

    // Investment / liquid capital
    const raw = lead.raw_fields || {};
    function getField(...keys) {
      for (const key of keys) {
        const norm = k => k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const found = Object.entries(raw).find(([k]) => norm(k).includes(norm(key)));
        if (found && found[1]) return found[1];
      }
      return null;
    }

    const liquidCapRaw = getField('liquid_capital', 'liquidcap', 'liquid', 'cashon', 'cash_available');
    const liquidCapNum = parseFloat((liquidCapRaw || '').toString().replace(/[^0-9.]/g, '')) || 0;
    const invLevel     = lead.investment_level || getField('investment', 'investmentlevel', 'investment_level') || '';
    const isHighDollar = liquidCapNum >= 250000
      || /\$500k|500,000|500k|\$1m|1,000,000|million|250k|250,000|\$250/i.test(invLevel + ' ' + (liquidCapRaw || ''));

    // Skip closed/lost
    const leadStatusClosed = ['closed', 'lost', 'disqualified'].includes((lead.status || '').toLowerCase());
    const bookingClosed    = bookings.some(b => (b.status || '').toLowerCase() === 'closed');
    if (leadStatusClosed || bookingClosed) return null;

    // Booking checks
    const STATUS_NOSHOW = ['no-show', 'no_show', 'noshow', 'no show'];
    const noShowRecent  = bookings.some(b => {
      if (!STATUS_NOSHOW.includes((b.status || '').toLowerCase())) return false;
      return b.slot_start && (now - new Date(b.slot_start)) < SEVEN_DAYS;
    });
    const anyNoShow = bookings.some(b => STATUS_NOSHOW.includes((b.status || '').toLowerCase()));
    const hasActive = bookings.some(b => ['scheduled', 'booked', 'showed'].includes((b.status || '').toLowerCase()));

    // Age + event signals
    const ageMs   = now - new Date(lead.created_at);
    const ageDays = ageMs / 86400000;

    const last24h       = events.filter(e => (now - new Date(e.created_at)) < ONE_DAY);
    const last7d        = events.filter(e => (now - new Date(e.created_at)) < SEVEN_DAYS);
    const recentEngaged = last7d.length > 0;

    const pageViews    = events.filter(e => e.event_type === 'booking_page_viewed').length;
    const callAttempts = events.filter(e => (e.event_type || '').startsWith('prospect_call')).length;
    const slotViews    = events.filter(e => ['recommended_slot_shown', 'slot_selected'].includes(e.event_type)).length;
    const cqActivity   = events.some(e => ['cq_email_sent', 'cq_received'].includes(e.event_type));

    // Decay
    let decay;
    if      (ageDays <= 7)  decay = 1.0;
    else if (ageDays <= 30) decay = 0.7;
    else if (ageDays <= 90) decay = 0.4;
    else                    decay = 0.1;

    const isResurrection = ageDays > 90 && recentEngaged;
    if (isResurrection)                     decay = 0.85;
    else if (ageDays > 30 && recentEngaged) decay = Math.max(decay, 0.65);

    // Base score
    let base = Math.min(lead.score || 45, 100);
    if      (ageDays < 1)    base = Math.min(base + 22, 100);
    else if (ageDays <= 2)   base = Math.min(base + 16, 100);
    if (isHighDollar)        base = Math.min(base + 15, 100);
    if (pageViews >= 3)      base = Math.min(base + 10, 100);
    else if (pageViews >= 2) base = Math.min(base + 6,  100);
    if (slotViews > 0)       base = Math.min(base + 8,  100);
    if (anyNoShow)           base = Math.min(base + 8,  100);
    if (callAttempts >= 5)   base = Math.max(base - 10, 5);

    const opportunityScore = Math.max(Math.round(base * decay), 1);

    // New bucket flags
    const isSpeedToLead = ageMs < SIX_HOURS && callAttempts === 0;
    const isVip         = isHighDollar && (recentEngaged || pageViews >= 2 || slotViews > 0);
    const isReEngaged   = last24h.length > 0 && ageMs >= SIX_HOURS && !isResurrection;
    const isNearMiss    = anyNoShow && !noShowRecent && !hasActive;

    // Bucket (priority order)
    let bucket;
    if      (noShowRecent)               bucket = 'saves';
    else if (isSpeedToLead)              bucket = 'speed_to_lead';
    else if (isVip)                      bucket = 'vip';
    else if (isReEngaged)                bucket = 're_engaged';
    else if (isNearMiss)                 bucket = 'near_miss';
    else if (isResurrection)             bucket = 'resurrection';
    else if (isHighDollar && !hasActive) bucket = 'high_dollar';
    else                                 bucket = 'hot';

    if (bucket === 'hot' && opportunityScore < 12) return null;

    const convRate           = CONVERSION_RATES[bucket] || 0.08;
    const commissionEstimate = Math.round(revenuePerClose * convRate);

    // Reasons
    const reasons = [];
    if      (ageDays < 1)   reasons.push('Lead submitted today');
    else if (ageDays <= 2)  reasons.push(`Lead submitted ${Math.round(ageDays * 24)}h ago`);
    else if (ageDays <= 7)  reasons.push(`Lead submitted ${Math.round(ageDays)} days ago — still in hot window`);
    else                    reasons.push(`Lead submitted ${Math.round(ageDays)} days ago`);

    if (liquidCapRaw)      reasons.push(`Liquid capital: ${liquidCapRaw}`);
    else if (isHighDollar) reasons.push('High investment level indicated');

    if (noShowRecent)      reasons.push('No-showed within the last 7 days');
    else if (anyNoShow)    reasons.push('Previously booked but did not show');

    if (isSpeedToLead)     reasons.push('Submitted within 6 hours — no contact yet');
    if (pageViews >= 2)    reasons.push(`Viewed booking page ${pageViews}×`);
    if (slotViews > 0)     reasons.push('Browsed available appointment slots');
    if (isResurrection)    reasons.push('Re-engaged after going dormant 90+ days');
    else if (isReEngaged)  reasons.push('Active in the last 24 hours');
    else if (recentEngaged && ageDays > 14) reasons.push('Showed recent activity after going quiet');

    if (cqActivity)         reasons.push('CQ in progress');
    if (callAttempts === 0) reasons.push('No advisor contact on record');
    else                    reasons.push(`${callAttempts} prior contact attempt${callAttempts !== 1 ? 's' : ''}`);

    // Next action
    let nextAction;
    if      (bucket === 'saves')         nextAction = 'Call now — 22% rebook when contacted same day';
    else if (bucket === 'speed_to_lead') nextAction = 'Call within 5 min — 21× booking rate';
    else if (bucket === 'vip')           nextAction = 'Senior advisor call — highest commission potential';
    else if (bucket === 're_engaged')    nextAction = 'Call now — active within the last 24 hours';
    else if (bucket === 'near_miss')     nextAction = 'SMS first, then follow-up call';
    else if (bucket === 'resurrection')  nextAction = 'Reach out now — re-engaged after going dark';
    else if (bucket === 'high_dollar')   nextAction = 'Priority call — outsized commission opportunity';
    else if (ageDays <= 2)               nextAction = 'Call now — leads reached in 5 min are 21× more likely to book';
    else                                 nextAction = 'Call today — conversion drops ~8% per day of delay';

    const location = [lead.location_city, lead.location_state].filter(Boolean).join(', ') || null;

    return {
      id:               lead.id,
      first_name:       lead.first_name  || '',
      last_name:        lead.last_name   || '',
      email:            lead.email       || '',
      phone:            lead.phone       || '',
      ghl_contact_id:   lead.ghl_contact_id || null,
      created_at:       lead.created_at,
      investment_level: invLevel || null,
      liquid_cap_raw:   liquidCapRaw || null,
      location,
      score:            opportunityScore,
      bucket,
      reasons,
      nextAction,
      commissionEstimate,
      ageDays:          Math.round(ageDays),
      isHighDollar,
      isResurrection,
      callAttempts,
      recentEngaged,
      hasBooking:       bookings.length > 0,
      noShowRecent,
    };
  }).filter(Boolean);

  scoredLeads.sort((a, b) => b.score - a.score);

  const buckets = {
    saves:         scoredLeads.filter(l => l.bucket === 'saves'),
    speed_to_lead: scoredLeads.filter(l => l.bucket === 'speed_to_lead'),
    vip:           scoredLeads.filter(l => l.bucket === 'vip'),
    re_engaged:    scoredLeads.filter(l => l.bucket === 're_engaged'),
    near_miss:     scoredLeads.filter(l => l.bucket === 'near_miss'),
    resurrection:  scoredLeads.filter(l => l.bucket === 'resurrection'),
    high_dollar:   scoredLeads.filter(l => l.bucket === 'high_dollar'),
    hot:           scoredLeads.filter(l => l.bucket === 'hot'),
  };

  // Hero aggregate
  const totalOpportunity = scoredLeads.reduce((sum, l) => sum + l.commissionEstimate, 0);
  const recoverableAppointments = Object.entries(buckets).reduce((sum, [key, leads]) => {
    return sum + leads.length * (CONVERSION_RATES[key] || 0.08);
  }, 0);
  const topLead = scoredLeads[0] || null;

  const hero = {
    totalOpportunity,
    recoverableAppointments: Math.round(recoverableAppointments * 10) / 10,
    totalLeads: scoredLeads.length,
    topLead: topLead ? {
      name:  [topLead.first_name, topLead.last_name].filter(Boolean).join(' '),
      score: topLead.score,
    } : null,
  };

  return res.json({ leads: scoredLeads, buckets, hero });
}
