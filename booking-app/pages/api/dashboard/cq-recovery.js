import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { lookupGHLContactByEmail } from '@/lib/ghl';

/**
 * GET /api/dashboard/cq-recovery
 *
 * The CQ Recovery queue: every meeting whose CQ was sent but not returned,
 * SCORED by a "commitment stack" — the more micro-commitments a person has made
 * (confirmed the appointment, showed for the call, opened the CQ email, brings
 * real liquid capital, recent engagement), the higher they rank. Each lead is
 * sorted into a priority bucket and given plain-English reasons.
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

const bucketKey = (email, slot) =>
  `${(email || '').toLowerCase()}:${Math.round(new Date(slot).getTime() / (30 * 60_000))}`;

// Priority order matters — first match wins.
const BUCKET_META = {
  hot:      { label: 'Hot — Chase Now',        blurb: 'Multiple commitments stacked — most likely to convert.', color: '#B91C1C', bg: '#FEF2F2', order: 1 },
  big_fish: { label: 'Big Fish',               blurb: 'High liquid capital — protect these regardless.',         color: '#9333EA', bg: '#FAF5FF', order: 2 },
  engaged:  { label: 'Engaged — No Submit',    blurb: 'Opened the CQ or active recently but hasn’t returned it.', color: '#B45309', bg: '#FFFBEB', order: 3 },
  warm:     { label: 'Warm',                   blurb: 'Showed or confirmed, but quiet on the CQ.',               color: '#15803D', bg: '#F0FDF4', order: 4 },
  at_risk:  { label: 'At Risk',                blurb: 'No-showed, declined, or going cold — needs a save.',       color: '#DC2626', bg: '#FEF2F2', order: 5 },
  cold:     { label: 'Cold / Frozen',          blurb: 'Aging with no signals — low priority.',                   color: '#64748B', bg: '#F8FAFC', order: 6 },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  const now      = Date.now();

  // 1. Outstanding CQs from the override store (Calendly/GHL bookings)
  const { data: ovrs } = await supabase
    .from('meeting_status_overrides')
    .select('email, slot_start, status, sms_confirmation, cq_sent_at, cq_received_at, cq_snoozed_until')
    .not('cq_sent_at', 'is', null)
    .is('cq_received_at', null);

  // 2. Outstanding CQs from native bookings
  const { data: nativeBks } = await supabase
    .from('bookings')
    .select('id, first_name, last_name, email, phone, slot_start, status, sms_confirmation, cq_sent_at, cq_received_at, assigned_to_email, ghl_contact_id, investment_level')
    .not('cq_sent_at', 'is', null)
    .is('cq_received_at', null);

  // Merge by email + 30-min slot bucket; honor snooze
  const items = new Map();
  for (const o of ovrs || []) {
    if (!o.email || !o.slot_start) continue;
    if (o.cq_snoozed_until && new Date(o.cq_snoozed_until).getTime() > now) continue;
    items.set(bucketKey(o.email, o.slot_start), {
      email: o.email, slot_start: o.slot_start, cq_sent_at: o.cq_sent_at,
      status: o.status || null, sms_confirmation: o.sms_confirmation || null, native: null,
    });
  }
  for (const b of nativeBks || []) {
    if (!b.email || !b.slot_start) continue;
    const k  = bucketKey(b.email, b.slot_start);
    const ex = items.get(k);
    items.set(k, {
      email: b.email, slot_start: b.slot_start,
      cq_sent_at: ex?.cq_sent_at || b.cq_sent_at,
      status: ex?.status || b.status || null,
      sms_confirmation: ex?.sms_confirmation || b.sms_confirmation || null,
      native: b,
    });
  }

  const list   = [...items.values()];
  const emails = [...new Set(list.map(i => i.email.toLowerCase()))];

  // 3. GHL contact enrichment (deduped by email): tags (emailopened), liquid, rep
  const apiKey = process.env.GHL_API_KEY;
  const contactByEmail = {};
  if (apiKey && emails.length) {
    const results = await Promise.allSettled(emails.map(e => lookupGHLContactByEmail(e).catch(() => null)));
    emails.forEach((e, i) => { contactByEmail[e] = results[i].status === 'fulfilled' ? results[i].value : null; });
  }

  // 3b. Rep names from assignedTo user ids
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

  // 4. Engagement events from lead_events (batched)
  const evByEmail = {};
  if (emails.length) {
    const { data: evs } = await supabase
      .from('lead_events')
      .select('email, event_type, created_at')
      .in('email', emails)
      .order('created_at', { ascending: false });
    for (const ev of evs || []) {
      const e = (ev.email || '').toLowerCase();
      (evByEmail[e] ||= []).push(ev);
    }
  }

  // 5. Score + bucket each lead
  const leads = list.map(i => {
    const e      = i.email.toLowerCase();
    const c      = contactByEmail[e] || null;
    const native = i.native || {};
    const evs    = evByEmail[e] || [];

    const tags        = (c?.tags || []).map(t => String(t).toLowerCase());
    const emailOpened = tags.some(t => t.includes('emailopen'));
    const liquidRaw   = getGHLLiquidCapital(c) || native.investment_level || null;
    const liquidNum   = parseFloat(String(liquidRaw || '').replace(/[^0-9.]/g, '')) || 0;
    const liquidHigh  = liquidNum >= 250000 || /\$?\b(250|300|350|400|500|750)\s?k|\$?\b(250|500|750),000|1\s?m|million|\$1m/i.test(String(liquidRaw || ''));

    const conf      = i.sms_confirmation;
    const statusLc  = (i.status || '').toLowerCase();
    const noShow    = statusLc === 'no-show' || evs.some(x => x.event_type === 'appointment_no_show');
    const showed    = (statusLc === 'showed' || evs.some(x => x.event_type === 'appointment_showed')) && !noShow;

    const lastEv        = evs[0] || null;
    const recentEngaged = evs.some(x => (now - new Date(x.created_at).getTime()) < 7 * DAY_MS);
    const pageViews     = evs.filter(x => x.event_type === 'booking_page_viewed').length;

    const cqSentAt = i.cq_sent_at;
    const days     = cqSentAt ? Math.floor((now - new Date(cqSentAt).getTime()) / DAY_MS) : 0;

    // ── Commitment-stack score ──
    let base = 20;
    const reasons = [];

    if (conf === 'confirmed')      { base += 22; reasons.push('Confirmed the appointment by text'); }
    else if (conf === 'uncertain') { base += 6;  reasons.push('Replied tentatively about the appointment'); }
    else if (conf === 'declined')  { base -= 12; reasons.push('Declined or cancelled by text'); }

    if (showed)      { base += 26; reasons.push('Showed for the meeting'); }
    else if (noShow) { base -= 18; reasons.push('No-showed the appointment'); }

    if (emailOpened) { base += 18; reasons.push('Opened the CQ email'); }

    if (liquidHigh)      { base += 16; reasons.push(`High liquid capital${liquidRaw ? `: ${liquidRaw}` : ''}`); }
    else if (liquidRaw)  { base += 6;  reasons.push(`Liquid capital: ${liquidRaw}`); }

    if (recentEngaged) { base += 10; reasons.push('Active in the system in the last 7 days'); }
    if (pageViews >= 2) { base += 6; reasons.push(`Viewed booking page ${pageViews}×`); }

    if (days <= 2)       reasons.push(`CQ sent ${days <= 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' ago'}`);
    else if (days <= 7)  reasons.push(`CQ sent ${days} days ago — still warm`);
    else if (days <= 14) reasons.push(`CQ sent ${days} days ago — cooling off`);
    else                 reasons.push(`CQ sent ${days} days ago — going cold`);

    // Day-based decay (commitments still keep high-intent leads near the top)
    let decay;
    if      (days <= 3)  decay = 1.0;
    else if (days <= 7)  decay = 0.92;
    else if (days <= 14) decay = 0.8;
    else if (days <= 30) decay = 0.6;
    else                 decay = 0.4;

    const score = Math.max(1, Math.min(100, Math.round(base * decay)));

    // ── Bucket (priority order) ──
    const commitments = [conf === 'confirmed', emailOpened, showed, liquidHigh].filter(Boolean).length;
    let bucket;
    if      (commitments >= 3)                          bucket = 'hot';
    else if (liquidHigh)                                bucket = 'big_fish';
    else if (emailOpened || recentEngaged || conf === 'confirmed') bucket = 'engaged';
    else if (showed)                                    bucket = 'warm';
    else if (noShow || conf === 'declined' || days > 21) bucket = 'at_risk';
    else                                                bucket = 'cold';

    return {
      email:          i.email,
      slot_start:     i.slot_start,
      first_name:     c?.firstName || native.first_name || '',
      last_name:      c?.lastName  || native.last_name  || '',
      phone:          c?.phone || native.phone || '',
      ghl_contact_id: c?.id || native.ghl_contact_id || null,
      liquid_capital: liquidRaw,
      assigned_rep:   (c?.assignedTo && userMap[c.assignedTo]) || native.assigned_to_email || null,
      booking_id:     native.id || null,
      cq_sent_at:     cqSentAt,
      days_waiting:   days,
      email_opened:   emailOpened,
      confirmation:   conf,
      showed,
      score,
      bucket,
      reasons,
      last_activity:  lastEv ? {
        type:     lastEv.event_type,
        at:       lastEv.created_at,
        days_ago: Math.floor((now - new Date(lastEv.created_at).getTime()) / DAY_MS),
      } : null,
    };
  }).sort((a, b) => b.score - a.score);

  // 6. Bucket counts + hero metrics
  const bucketCounts = {};
  for (const l of leads) bucketCounts[l.bucket] = (bucketCounts[l.bucket] || 0) + 1;

  const total   = leads.length;
  const avgDays = total ? Math.round(leads.reduce((s, l) => s + l.days_waiting, 0) / total) : 0;
  const metrics = {
    total,
    hot:       bucketCounts.hot || 0,
    bigFish:   bucketCounts.big_fish || 0,
    engaged:   bucketCounts.engaged || 0,
    avgDays,
    goingCold: leads.filter(l => l.days_waiting >= 14).length,
  };

  res.json({ leads, metrics, bucketCounts, bucketMeta: BUCKET_META });
}
