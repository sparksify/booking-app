import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getPermissions, getRepIdentity, repMatches } from '@/lib/role';
import { OUTCOME_STAGE } from '@/lib/dealDesk';
import { getDayBoundsUTC, BOOKING_TZ } from './bookings';

function bounds(filter) {
  const now = new Date();
  if (filter === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate() + 1); return getDayBoundsUTC(d, BOOKING_TZ); }
  if (filter === 'week') { const d = new Date(now); d.setDate(d.getDate() + 13); return { from: getDayBoundsUTC(now, BOOKING_TZ).from, to: getDayBoundsUTC(d, BOOKING_TZ).to }; }
  if (filter === 'all') { const d = new Date(now); d.setDate(d.getDate() + 60); return { from: new Date(0), to: getDayBoundsUTC(d, BOOKING_TZ).to }; }
  return getDayBoundsUTC(now, BOOKING_TZ);
}

async function context(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) return null;
  const email = session.user.email.toLowerCase();
  return { email, perms: await getPermissions(email), identities: await getRepIdentity(email) };
}

export default async function handler(req, res) {
  const ctx = await context(req, res);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
  const db = getSupabaseAdmin();

  if (req.method === 'GET') {
    if (req.query.email) {
      const { data, error } = await db.from('deals').select('id, brand, status, assigned_to_email').ilike('email', req.query.email).eq('status', 'active');
      if (error) return res.status(500).json({ error: error.message });
      const deals = ctx.perms.meetings_view_all ? (data || []) : (data || []).filter(d => repMatches(d.assigned_to_email, ctx.identities));
      return res.json({ deals });
    }
    const { from, to } = bounds(req.query.filter || 'today');
    let q = db.from('deal_followups').select('*, deal:deals(*)').eq('status', 'pending').lte('due_at', to.toISOString()).order('due_at');
    // Today deliberately has no lower bound: overdue work must never disappear.
    if (req.query.filter !== 'today' && req.query.filter !== 'all') q = q.gte('due_at', from.toISOString());
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const followups = ctx.perms.meetings_view_all ? (data || []) : (data || []).filter(f => repMatches(f.assigned_to_email, ctx.identities));
    return res.json({ followups, viewAll: !!ctx.perms.meetings_view_all });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.email || !b.brand || !b.due_at) return res.status(400).json({ error: 'Email, brand, and first follow-up are required.' });
    const assigned = ctx.perms.meetings_view_all && b.assigned_to_email ? b.assigned_to_email : ctx.email;
    const existing = await db.from('deals').select('id').ilike('email', b.email).ilike('brand', b.brand).eq('status', 'active').maybeSingle();
    if (existing.data) return res.status(409).json({ error: 'An active deal already exists for this candidate and brand.' });
    const dealValues = { lead_id: b.lead_id || null, email: b.email, phone: b.phone || null, first_name: b.first_name || null, last_name: b.last_name || null, brand: b.brand.trim(), assigned_to_email: assigned, developer_name: b.developer_name || null, developer_email: b.developer_email || null, units: b.units || null, estimated_deal_value: b.estimated_deal_value || null };
    const { data: deal, error } = await db.from('deals').insert(dealValues).select().single();
    if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message });
    const { data: followup, error: followupError } = await db.from('deal_followups').insert({ deal_id: deal.id, assigned_to_email: assigned, due_at: b.due_at, note: b.note || 'Check in after franchise submission' }).select().single();
    if (followupError) { await db.from('deals').delete().eq('id', deal.id); return res.status(500).json({ error: followupError.message }); }
    return res.status(201).json({ deal, followup: { ...followup, deal } });
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const { data: followup } = await db.from('deal_followups').select('*, deal:deals(*)').eq('id', b.followup_id).maybeSingle();
    if (!followup) return res.status(404).json({ error: 'Follow-up not found.' });
    if (!ctx.perms.meetings_view_all && !repMatches(followup.assigned_to_email, ctx.identities)) return res.status(403).json({ error: 'Forbidden' });
    if (followup.status !== 'pending') return res.status(409).json({ error: 'This follow-up is no longer pending.' });
    if (b.action === 'snooze') {
      if (!b.due_at || new Date(b.due_at) <= new Date()) return res.status(400).json({ error: 'Choose a future snooze time.' });
      const { data, error } = await db.from('deal_followups').update({ due_at: b.due_at, updated_at: new Date().toISOString() }).eq('id', followup.id).eq('status', 'pending').select().single();
      return error ? res.status(500).json({ error: error.message }) : res.json({ followup: { ...data, deal: followup.deal } });
    }
    if (b.action === 'complete') {
      if (!b.close_deal && (!b.next_due_at || new Date(b.next_due_at) <= new Date())) return res.status(400).json({ error: 'Every active deal needs a future next action.' });
      const now = new Date().toISOString();
      // Create the next action first so a transient insert failure can never leave
      // an active deal without pending work.
      let next = null;
      if (!b.close_deal) {
        const result = await db.from('deal_followups').insert({ deal_id: followup.deal_id, assigned_to_email: followup.assigned_to_email, due_at: b.next_due_at, note: b.next_note || 'Continue franchise follow-up' }).select().single();
        if (result.error) return res.status(500).json({ error: result.error.message });
        next = result.data;
      }
      const { error } = await db.from('deal_followups').update({ status: 'completed', completed_at: now, outcome: b.outcome || 'other', note: b.note || followup.note, updated_at: now }).eq('id', followup.id).eq('status', 'pending');
      if (error) {
        if (next) await db.from('deal_followups').delete().eq('id', next.id);
        return res.status(500).json({ error: error.message });
      }
      const dealUpdate = { last_touch_at: now, updated_at: now };
      if (OUTCOME_STAGE[b.outcome]) dealUpdate.stage = OUTCOME_STAGE[b.outcome];
      if (b.close_deal) Object.assign(dealUpdate, { status: b.deal_status || 'paused', closed_at: now, stage: 'closed' });
      await db.from('deals').update(dealUpdate).eq('id', followup.deal_id);
      return res.json({ ok: true, next });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  }
  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).end();
}
