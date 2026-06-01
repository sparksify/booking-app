import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/activity-feed
 *
 * Returns the 100 most recent lead_events from the last 7 days,
 * enriched with lead names. Used for the Opportunity Feed tab.
 *
 * Response: { events: [{ id, lead_id, lead_name, event_type, label, created_at, rep_email }] }
 */

const EVENT_LABELS = {
  booking_page_viewed:          'Viewed the booking page',
  slot_selected:                'Selected an appointment slot',
  recommended_slot_shown:       'Browsed available slots',
  cq_email_sent:                'CQ email sent',
  cq_received:                  'CQ returned',
  form_submitted:               'Submitted inquiry form',
  prospect_call_no_answer:      'Call — No answer',
  prospect_call_left_vm:        'Call — Left voicemail',
  prospect_call_booked:         'Call — Booked!',
  prospect_call_not_interested: 'Call — Not interested',
  prospect_call_follow_up:      'Call — Scheduled follow-up',
  prospect_call_skipped:        'Lead skipped in queue',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from('lead_events')
    .select('id, lead_id, event_type, created_at, metadata')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!events?.length) return res.json({ events: [] });

  // Fetch lead names
  const leadIds = [...new Set(events.map(e => e.lead_id))];
  const { data: leads } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email')
    .in('id', leadIds);

  const leadMap = {};
  for (const l of leads || []) leadMap[l.id] = l;

  const formatted = events.map(e => {
    const lead = leadMap[e.lead_id];
    const name = lead
      ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
      : 'Unknown lead';

    return {
      id:         e.id,
      lead_id:    e.lead_id,
      lead_name:  name,
      event_type: e.event_type,
      label:      EVENT_LABELS[e.event_type] || e.event_type.replace(/_/g, ' '),
      created_at: e.created_at,
      rep_email:  e.metadata?.rep_email || null,
    };
  });

  return res.json({ events: formatted });
}
