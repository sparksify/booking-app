import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/advisor-stats
 *
 * Returns per-advisor prospecting metrics for the last 30 days.
 * Aggregated from lead_events (prospect_call_*) and bookings.
 *
 * Response: { advisors: [{ rep, calls, connected, booked, voicemail, no_answer, convRate, showRate }] }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
  const thirtyDaysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: callEvents }, { data: bookings }] = await Promise.all([
    supabase
      .from('lead_events')
      .select('lead_id, event_type, metadata, created_at')
      .like('event_type', 'prospect_call_%')
      .gte('created_at', thirtyDaysAgo),
    supabase
      .from('bookings')
      .select('lead_id, status, assigned_to_email, created_at')
      .gte('created_at', thirtyDaysAgo),
  ]);

  // Group call events by advisor email
  const advisors = {};

  for (const e of callEvents || []) {
    const rep = e.metadata?.rep_email || 'Unknown';
    if (!advisors[rep]) {
      advisors[rep] = {
        rep,
        calls:        0,
        connected:    0,
        voicemail:    0,
        booked:       0,
        not_interested: 0,
        follow_up:    0,
        no_answer:    0,
      };
    }

    const type = e.event_type;
    advisors[rep].calls++;

    if (type.includes('booked'))          { advisors[rep].booked++;         advisors[rep].connected++; }
    if (type.includes('left_vm'))           advisors[rep].voicemail++;
    if (type.includes('not_interested'))  { advisors[rep].not_interested++; advisors[rep].connected++; }
    if (type.includes('follow_up'))       { advisors[rep].follow_up++;      advisors[rep].connected++; }
    if (type.includes('no_answer'))         advisors[rep].no_answer++;
  }

  // Add show rates from bookings by assigned rep
  const showsByRep  = {};
  const totalsByRep = {};

  for (const b of bookings || []) {
    const rep = b.assigned_to_email || 'Unknown';
    totalsByRep[rep] = (totalsByRep[rep] || 0) + 1;
    if (['showed', 'closed'].includes((b.status || '').toLowerCase())) {
      showsByRep[rep] = (showsByRep[rep] || 0) + 1;
    }
  }

  const result = Object.values(advisors)
    .map(a => ({
      ...a,
      convRate: a.calls > 0 ? Math.round((a.booked / a.calls) * 100) : 0,
      showRate: totalsByRep[a.rep] > 0
        ? Math.round(((showsByRep[a.rep] || 0) / totalsByRep[a.rep]) * 100)
        : null,
    }))
    .sort((a, b) => b.booked - a.booked || b.calls - a.calls);

  return res.json({ advisors: result });
}
