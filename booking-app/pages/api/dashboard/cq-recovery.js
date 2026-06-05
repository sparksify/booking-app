import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { lookupGHLContactByEmail } from '@/lib/ghl';

/**
 * GET /api/dashboard/cq-recovery
 *
 * The CQ Recovery queue: every meeting whose CQ was sent but not returned.
 * CQ timestamps live in the override store (Calendly/GHL bookings) as well as
 * the bookings table (native), so we read both. Each lead is enriched from GHL
 * (name, phone, liquid capital, assigned rep) and given a days-waiting count,
 * urgency tier, and last system activity.
 */

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const DAY_MS      = 24 * 60 * 60 * 1000;
const LIQUID_CAPITAL_FIELD_IDS = new Set(['MquK4nPLhrQTUbvnHzTZ', '40JagvBXAiZeP1Ieepol']);

function getGHLLiquidCapital(contact) {
  if (!contact?.customFields) return null;
  const cf = contact.customFields.find(f => LIQUID_CAPITAL_FIELD_IDS.has(f.id));
  return cf?.value || null;
}

function urgencyTier(days) {
  if (days >= 14) return 'frozen';
  if (days >= 7)  return 'cold';
  if (days >= 3)  return 'warm';
  return 'fresh';
}

const bucketKey = (email, slot) =>
  `${(email || '').toLowerCase()}:${Math.round(new Date(slot).getTime() / (30 * 60_000))}`;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  const now      = Date.now();

  // 1. Outstanding CQs from the override store (Calendly/GHL bookings)
  const { data: ovrs } = await supabase
    .from('meeting_status_overrides')
    .select('email, slot_start, cq_sent_at, cq_received_at, cq_snoozed_until')
    .not('cq_sent_at', 'is', null)
    .is('cq_received_at', null);

  // 2. Outstanding CQs from native bookings
  const { data: nativeBks } = await supabase
    .from('bookings')
    .select('id, first_name, last_name, email, phone, slot_start, cq_sent_at, cq_received_at, assigned_to_email, ghl_contact_id, investment_level')
    .not('cq_sent_at', 'is', null)
    .is('cq_received_at', null);

  // Merge by email + 30-min slot bucket; honor snooze
  const items = new Map();
  for (const o of ovrs || []) {
    if (!o.email || !o.slot_start) continue;
    if (o.cq_snoozed_until && new Date(o.cq_snoozed_until).getTime() > now) continue;
    items.set(bucketKey(o.email, o.slot_start), { email: o.email, slot_start: o.slot_start, cq_sent_at: o.cq_sent_at, native: null });
  }
  for (const b of nativeBks || []) {
    if (!b.email || !b.slot_start) continue;
    const k  = bucketKey(b.email, b.slot_start);
    const ex = items.get(k);
    items.set(k, { email: b.email, slot_start: b.slot_start, cq_sent_at: ex?.cq_sent_at || b.cq_sent_at, native: b });
  }

  const list   = [...items.values()];
  const emails = [...new Set(list.map(i => i.email.toLowerCase()))];

  // 3. GHL contact enrichment (deduped by email)
  const apiKey = process.env.GHL_API_KEY;
  const contactByEmail = {};
  if (apiKey && emails.length) {
    const results = await Promise.allSettled(emails.map(e => lookupGHLContactByEmail(e).catch(() => null)));
    emails.forEach((e, i) => { contactByEmail[e] = results[i].status === 'fulfilled' ? results[i].value : null; });
  }

  // 3b. Resolve rep names from assignedTo user ids
  const userIds = [...new Set(Object.values(contactByEmail).map(c => c?.assignedTo).filter(Boolean))];
  const userMap = {};
  if (apiKey && userIds.length) {
    const headers = { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION };
    const ures = await Promise.allSettled(userIds.map(uid =>
      fetch(`${GHL_API}/users/${uid}`, { headers }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    ));
    userIds.forEach((uid, i) => {
      const u = ures[i].status === 'fulfilled' ? ures[i].value : null;
      const name = u?.name || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || null;
      if (name) userMap[uid] = name;
    });
  }

  // 4. Last system activity from lead_events (batched)
  const lastActivityByEmail = {};
  if (emails.length) {
    const { data: evs } = await supabase
      .from('lead_events')
      .select('email, event_type, created_at')
      .in('email', emails)
      .order('created_at', { ascending: false });
    for (const ev of evs || []) {
      const e = (ev.email || '').toLowerCase();
      if (!lastActivityByEmail[e]) lastActivityByEmail[e] = { event_type: ev.event_type, created_at: ev.created_at };
    }
  }

  // 5. Build the queue
  const leads = list.map(i => {
    const e      = i.email.toLowerCase();
    const c      = contactByEmail[e] || null;
    const native = i.native || {};
    const cqSentAt = i.cq_sent_at;
    const days   = cqSentAt ? Math.floor((now - new Date(cqSentAt).getTime()) / DAY_MS) : 0;
    const la     = lastActivityByEmail[e] || null;
    return {
      email:          i.email,
      slot_start:     i.slot_start,
      first_name:     c?.firstName || native.first_name || '',
      last_name:      c?.lastName  || native.last_name  || '',
      phone:          c?.phone || native.phone || '',
      ghl_contact_id: c?.id || native.ghl_contact_id || null,
      liquid_capital: getGHLLiquidCapital(c) || native.investment_level || null,
      assigned_rep:   (c?.assignedTo && userMap[c.assignedTo]) || native.assigned_to_email || null,
      booking_id:     native.id || null,
      cq_sent_at:     cqSentAt,
      days_waiting:   days,
      urgency:        urgencyTier(days),
      last_activity:  la ? {
        type:     la.event_type,
        at:       la.created_at,
        days_ago: Math.floor((now - new Date(la.created_at).getTime()) / DAY_MS),
      } : null,
    };
  }).sort((a, b) => b.days_waiting - a.days_waiting);

  // 6. Hero metrics
  const total          = leads.length;
  const avgDays        = total ? Math.round(leads.reduce((s, l) => s + l.days_waiting, 0) / total) : 0;
  const oldest         = total ? Math.max(...leads.map(l => l.days_waiting)) : 0;
  const goingCold      = leads.filter(l => !l.last_activity || l.last_activity.days_ago >= 7).length;
  const recentlyActive = leads.filter(l => l.last_activity && l.last_activity.days_ago <= 3).length;

  res.json({ leads, metrics: { total, avgDays, oldest, goingCold, recentlyActive } });
}
