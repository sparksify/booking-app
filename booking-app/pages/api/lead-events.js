import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { logLeadEvent, getLeadTimeline } from '@/lib/leadEvents';

/**
 * /api/lead-events
 *
 * GET  ?email=x   — Returns the full ordered timeline for a lead (dashboard-only, requires session)
 * POST            — Logs a single client-side event (no auth required — booking page uses this)
 *
 * POST body:
 *   { email, event_type, event_data?, lead_id? }
 *
 * Client-safe event types (allowlist to prevent abuse):
 *   booking_page_viewed, recommended_slot_shown, recommended_slot_accepted,
 *   recommended_slot_rejected, slot_selected, calendar_add_clicked
 */

const CLIENT_EVENT_ALLOWLIST = new Set([
  'booking_page_viewed',
  'recommended_slot_shown',
  'recommended_slot_accepted',
  'recommended_slot_rejected',
  'slot_selected',
  'calendar_add_clicked',
]);

export default async function handler(req, res) {
  // ── GET: dashboard timeline fetch ────────────────────────────────────────────
  if (req.method === 'GET') {
    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });

    const events = await getLeadTimeline(email);
    return res.json({ events });
  }

  // ── POST: client-side event logging ──────────────────────────────────────────
  if (req.method === 'POST') {
    const { email, event_type, event_data = {}, lead_id } = req.body || {};

    if (!email || !event_type) {
      return res.status(400).json({ error: 'email and event_type required' });
    }
    if (!CLIENT_EVENT_ALLOWLIST.has(event_type)) {
      return res.status(400).json({ error: `Event type not allowed: ${event_type}` });
    }

    await logLeadEvent(email, event_type, event_data, { leadId: lead_id });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
