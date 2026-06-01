import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/prospects
 *
 * Returns all active leads scored with a decay-adjusted opportunity score,
 * bucketed into: hot | saves | resurrection | high_dollar
 *
 * Scoring model:
 *   base    = lead.score (from scoring.js, stored in DB) capped 0-100
 *   decay   = 1.0 (0-7d) | 0.7 (8-30d) | 0.4 (31-90d) | 0.1 (90+d)
 *   signals = override decay upward when recent engagement detected
 *   bonus   = freshness (0-48h), high investment, page views, prior booking intent
 *   final   = round(base * decay) + bonuses, capped 99
 *
 * Buckets (priority order — a lead is only in one):
 *   saves        — no-show within 7 days, not subsequently closed
 *   resurrection — 90+ days old + recent engagement (decay overridden to 0.85)
 *   high_dollar  — investment >= $250k and no closed booking
 *   hot          — everything else with final score >= 15
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  // ── 1. Fetch leads (exclude explicitly closed) ────────────────────────────
  const { data: rawLeads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, phone, created_at, score, investment_level, raw_fields, ghl_contact_id, location_city, location_state, location_zip')
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(400);

  if (leadsErr || !rawLeads || rawLeads.length === 0) {
    return res.json({ leads: [], buckets: { hot: [], saves: [], resurrection: [], high_dollar: [] } });
  }

  const leadIds = rawLeads.map(l => l.id);

  // ── 2. Fetch bookings + events for those leads in parallel ────────────────
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

  // Index by lead_id
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
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const scoredLeads = rawLeads.map(lead => {
    const bookings = bookingsByLead[lead.id] || [];
    const events   = eventsByLead[lead.id]   || [];

    // ── Investment / liquid capital ─────────────────────────────────────────
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

    // ── Booking status checks ───────────────────────────────────────────────
    const isClosed = bookings.some(b => (b.status || '').toLowerCase() === 'closed');
    if (isClosed) return null; // skip closed deals entirely

    const STATUS_NOSHOW = ['no-show', 'no_show', 'noshow', 'no show'];
    const noShowRecent  = bookings.some(b => {
      if (!STATUS_NOSHOW.includes((b.status || '').toLowerCase())) return false;
      return b.slot_start && (now - new Date(b.slot_start)) < SEVEN_DAYS;
    });
    const anyNoShow     = bookings.some(b => STATUS_NOSHOW.includes((b.status || '').toLowerCase()));
    const hasBooking    = bookings.length > 0;
    const hasActive     = bookings.some(b => ['scheduled', 'booked', 'showed'].includes((b.status || '').toLowerCase()));

    // ── Event signals ───────────────────────────────────────────────────────
    const last7d = events.filter(e => (now - new Date(e.created_at)) < SEVEN_DAYS);
    const last14d = events.filter(e => (now - new Date(e.created_at)) < 14 * 24 * 60 * 60 * 1000);
    const recentEngaged = last7d.length > 0;

    const pageViews    = events.filter(e => e.event_type === 'booking_page_viewed').length;
    const callAttempts = events.filter(e => (e.event_type || '').startsWith('prospect_call')).length;
    const slotViews    = events.filter(e => ['recommended_slot_shown', 'slot_selected'].includes(e.event_type)).length;
    const cqActivity   = events.some(e => ['cq_email_sent', 'cq_received'].includes(e.event_type));

    // ── Age + decay ─────────────────────────────────────────────────────────
    const ageDays = (now - new Date(lead.created_at)) / 86400000;

    let decay;
    if      (ageDays <= 7)  decay = 1.0;
    else if (ageDays <= 30) decay = 0.7;
    else if (ageDays <= 90) decay = 0.4;
    else                    decay = 0.1;

    const isResurrection = ageDays > 90 && recentEngaged;
    if (isResurrection)              decay = 0.85;
    else if (ageDays > 30 && recentEngaged) decay = Math.max(decay, 0.65);

    // ── Base score ──────────────────────────────────────────────────────────
    let base = Math.min(lead.score || 45, 100);

    // Freshness bonus
    if      (ageDays < 1)  base = Math.min(base + 22, 100);
    else if (ageDays <= 2) base = Math.min(base + 16, 100);

    // Investment quality
    if (isHighDollar) base = Math.min(base + 15, 100);

    // Engagement signals
    if (pageViews >= 3)  base = Math.min(base + 10, 100);
    else if (pageViews >= 2) base = Math.min(base + 6, 100);
    if (slotViews > 0)   base = Math.min(base + 8,  100);
    if (anyNoShow)       base = Math.min(base + 8,  100); // showed enough intent to book

    // Prior attempts (slight negative — harder to reach)
    if (callAttempts >= 5) base = Math.max(base - 10, 5);

    const opportunityScore = Math.max(Math.round(base * decay), 1);

    // ── Bucket assignment (priority order) ──────────────────────────────────
    let bucket;
    if (noShowRecent)                              bucket = 'saves';
    else if (isResurrection)                       bucket = 'resurrection';
    else if (isHighDollar && !hasActive)           bucket = 'high_dollar';
    else                                           bucket = 'hot';

    // Drop very-low-scoring hot leads (unlikely to convert, clutter the queue)
    if (bucket === 'hot' && opportunityScore < 12) return null;

    // ── Reason lines (shown in card and queue) ──────────────────────────────
    const reasons = [];
    if      (ageDays < 1)   reasons.push('Lead submitted today');
    else if (ageDays <= 2)  reasons.push(`Lead submitted ${Math.round(ageDays * 24)}h ago`);
    else if (ageDays <= 7)  reasons.push(`Lead submitted ${Math.round(ageDays)} days ago — still in hot window`);
    else                    reasons.push(`Lead submitted ${Math.round(ageDays)} days ago`);

    if (liquidCapRaw)       reasons.push(`Liquid capital: ${liquidCapRaw}`);
    else if (isHighDollar)  reasons.push('High investment level indicated');

    if (noShowRecent)       reasons.push('No-showed within the last 7 days');
    else if (anyNoShow)     reasons.push('Previously booked but did not show');

    if (pageViews >= 2)     reasons.push(`Viewed booking page ${pageViews}×`);
    if (slotViews > 0)      reasons.push('Browsed available appointment slots');
    if (isResurrection)     reasons.push('Re-engaged after going dormant 90+ days');
    else if (recentEngaged && ageDays > 14) reasons.push('Showed recent activity after going quiet');

    if (cqActivity)         reasons.push('CQ in progress');
    if (callAttempts === 0) reasons.push('No advisor contact on record');
    else                    reasons.push(`${callAttempts} prior contact attempt${callAttempts !== 1 ? 's' : ''}`);

    // ── Recommended action text ─────────────────────────────────────────────
    let recommendedAction;
    if (bucket === 'saves') {
      recommendedAction = 'Call within 24 hours — 22% of no-shows rebook when contacted immediately after.';
    } else if (bucket === 'resurrection') {
      recommendedAction = 'Reach out now — they re-engaged after going dark. Strike while intent is warm.';
    } else if (bucket === 'high_dollar') {
      recommendedAction = 'Priority outreach — high investment level means outsized commission potential.';
    } else if (ageDays <= 2) {
      recommendedAction = 'Call now — leads reached within 5 minutes are 21× more likely to book.';
    } else {
      recommendedAction = 'Call today — every day of delay drops show probability by ~8%.';
    }

    // ── Location ────────────────────────────────────────────────────────────
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
      recommendedAction,
      ageDays:          Math.round(ageDays),
      isHighDollar,
      isResurrection,
      callAttempts,
      recentEngaged,
      hasBooking,
      noShowRecent,
    };
  }).filter(Boolean);

  // Sort by score descending
  scoredLeads.sort((a, b) => b.score - a.score);

  const buckets = {
    hot:          scoredLeads.filter(l => l.bucket === 'hot'),
    saves:        scoredLeads.filter(l => l.bucket === 'saves'),
    resurrection: scoredLeads.filter(l => l.bucket === 'resurrection'),
    high_dollar:  scoredLeads.filter(l => l.bucket === 'high_dollar'),
  };

  return res.json({ leads: scoredLeads, buckets });
}
