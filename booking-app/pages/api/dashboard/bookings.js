import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

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
    from = new Date(now); from.setDate(now.getDate() - now.getDay()); from.setHours(0, 0, 0, 0);
    to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999);
  }

  let query = supabase
    .from('bookings')
    .select('id, first_name, last_name, email, phone, slot_start, slot_end, status, investment_level, assigned_to_email, meet_link, created_at')
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

  const enriched = (bookings || []).map(b => ({
    ...b,
    lead_status:     leadsByEmail[b.email]?.status     ?? null,
    ghl_contact_id:  leadsByEmail[b.email]?.ghl_contact_id ?? null,
  }));

  res.json({ bookings: enriched });
}
