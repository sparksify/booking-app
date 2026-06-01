import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { computeLeadScore, computeShowProbability, getHealthBadge } from '@/lib/scoring';

/**
 * GET /api/dashboard/bookings
 *
 * Returns bookings joined with lead status/GHL info.
 * Query params:
 *   filter = 'today' | 'week' | 'all'  (default: 'today')
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const filter = req.query.filter || 'today';
  const supabase = getSupabaseAdmin();

  const now = new Date();
  let from, to;

  if (filter === 'today') {
    from = new Date(now); from.setHours(0, 0, 0, 0);
    to   = new Date(now); to.setHours(23, 59, 59, 999);
  } else if (filter === 'week') {
    // Rolling 14-day window: start of today through end of day +13
    // Keeps this week + next week always visible regardless of what day it is
    from = new Date(now); from.setHours(0, 0, 0, 0);
    to   = new Date(from); to.setDate(from.getDate() + 13); to.setHours(23, 59, 59, 999);
  }

  let query = supabase
    .from('bookings')
    .select('id, first_name, last_name, email, phone, slot_start, slot_end, status, investment_level, assigned_to_email, meet_link, created_at, lead_score, show_probability, fb_attribution, booking_source, cq_sent_at, cq_received_at')
    .order('slot_start', { ascending: true });

  if (from && to) {
    query = query.gte('slot_start', from.toISOString()).lte('slot_start', to.toISOString());
  }

  const { data: bookings, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Attach lead status + ghl_contact_id by matching on email
  const emails = [...new Set((bookings || []).map(b => b.email).filter(Boolean))];
  let leadsByEmail = {};
  if (emails.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('email, status, ghl_contact_id')
      .in('email', emails);
    (leads || []).forEach(l => { leadsByEmail[l.email] = l; });
  }

  const enriched = (bookings || []).map(b => {
    const lead = leadsByEmail[b.email] ?? null;
    // Compute scores on-the-fly for old bookings that pre-date the scoring columns
    const leadScore      = b.lead_score      ?? computeLeadScore(b, lead);
    const showProbability = b.show_probability ?? computeShowProbability(b, lead);
    const health         = getHealthBadge(leadScore, showProbability);

    return {
      ...b,
      lead_status:      lead?.status         ?? null,
      ghl_contact_id:   lead?.ghl_contact_id ?? null,
      lead_score:       leadScore,
      show_probability: showProbability,
      health,
      booking_source:   b.booking_source     ?? null,
    };
  });

  res.json({ bookings: enriched });
}
