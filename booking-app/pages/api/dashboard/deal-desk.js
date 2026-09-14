import crypto from 'crypto';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getPermissions, getRepIdentity } from '@/lib/role';
import { addDaysAtWorkTime, DEAL_STAGES, DEAL_STATUSES, FOLLOWUP_TARGETS } from '@/lib/dealDesk';
import { getDayBoundsUTC, BOOKING_TZ } from './bookings';

const OUTCOMES = ['connected','left_voicemail','texted','waiting_on_developer','validation_scheduled','discovery_day_scheduled','decision_pending','other'];
const ACTIONS = ['follow_up','call','text','email'];
const MANUAL_STAGES = DEAL_STAGES.filter(stage => stage !== 'closed');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = value => typeof value === 'string' ? value.trim() : '';
const validEmail = value => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

function dateBounds(filter, timezone) {
  const now = new Date();
  if (filter === 'tomorrow') return getDayBoundsUTC(addDaysAtWorkTime(1, now, timezone), timezone);
  if (filter === 'week') return { from: getDayBoundsUTC(now, timezone).from, to: getDayBoundsUTC(addDaysAtWorkTime(13, now, timezone), timezone).to };
  if (filter === 'all') return { from: new Date(0), to: null };
  return getDayBoundsUTC(now, timezone);
}

function parseFuture(value, required = true) {
  if (!value && !required) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d <= new Date() || d > new Date(Date.now() + 366 * 86400000)) return undefined;
  return d.toISOString();
}

async function requestContext(req, res, db) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) return null;
  const email = session.user.email.toLowerCase();
  const [perms, identities, settingsResult] = await Promise.all([
    getPermissions(email), getRepIdentity(email), db.from('settings').select('timezone,work_start,work_end').eq('id', 1).maybeSingle(),
  ]);
  const assignees = [...identities].map(v => String(v).toLowerCase());
  return { email, perms, assignees, settings: settingsResult.data || { timezone: BOOKING_TZ, work_start: 9, work_end: 18 } };
}

function scope(query, ctx, column = 'assigned_to_email') {
  return ctx.perms.meetings_view_all ? query : query.in(column, ctx.assignees);
}

async function ownedDeal(db, id, ctx) {
  return scope(db.from('deals').select('*').eq('id', id), ctx).maybeSingle();
}

export default async function handler(req, res) {
  const db = getSupabaseAdmin();
  const ctx = await requestContext(req, res, db);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
  const timezone = ctx.settings.timezone || BOOKING_TZ;

  if (req.method === 'GET') {
    if (req.query.deal_id) {
      const { data: deal, error } = await ownedDeal(db, req.query.deal_id, ctx);
      if (error) return res.status(500).json({ error: error.message });
      if (!deal) return res.status(404).json({ error: 'Deal not found.' });
      const history = await db.from('deal_followups').select('*').eq('deal_id', deal.id).order('created_at', { ascending: false });
      if (history.error) return res.status(500).json({ error: history.error.message });
      return res.json({ deal, history: history.data || [], settings: ctx.settings });
    }
    if (req.query.email) {
      let query = db.from('deals').select('id,brand,status,assigned_to_email').ilike('email', req.query.email).eq('status', 'active');
      const { data, error } = await scope(query, ctx);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ deals: data || [], settings: ctx.settings });
    }
    const selectedFilter = req.query.filter || 'today';
    const { from, to } = dateBounds(selectedFilter, timezone);
    let query = db.from('deal_followups').select('*,deal:deals(*)').eq('status', 'pending').order('due_at');
    query = scope(query, ctx);
    if (selectedFilter !== 'all') query = query.lte('due_at', to.toISOString());
    if (!['today','all'].includes(selectedFilter)) query = query.gte('due_at', from.toISOString());
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const inactiveResult = await scope(db.from('deals').select('id,email,first_name,last_name,brand,status,stage,assigned_to_email,updated_at,closed_at,close_reason').in('status', ['paused','won','lost']).order('updated_at', { ascending: false }), ctx);
    if (inactiveResult.error) return res.status(500).json({ error: inactiveResult.error.message });
    return res.json({ followups: data || [], inactive_deals: inactiveResult.data || [], settings: ctx.settings, viewAll: !!ctx.perms.meetings_view_all });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const email = clean(b.email).toLowerCase(); const brand = clean(b.brand); const dueAt = parseFuture(b.due_at);
    if (!email || !validEmail(email) || !brand || brand.length > 150 || !dueAt) return res.status(400).json({ error: 'A valid candidate, brand, and future follow-up within one year are required.' });
    if (!validEmail(clean(b.developer_email))) return res.status(400).json({ error: 'Developer email is invalid.' });
    if (b.estimated_deal_value !== '' && b.estimated_deal_value != null && (!Number.isFinite(Number(b.estimated_deal_value)) || Number(b.estimated_deal_value) < 0)) return res.status(400).json({ error: 'Estimated commission must be a positive number.' });
    if (b.stage && !MANUAL_STAGES.includes(b.stage)) return res.status(400).json({ error: 'Invalid stage.' });
    const target = FOLLOWUP_TARGETS.includes(b.contact_target) ? b.contact_target : 'candidate';
    let assigned = clean(b.assigned_to_email).toLowerCase() || ctx.email;
    let candidateQuery = db.from('bookings').select('id,lead_id,cq_received_at,assigned_to_email').ilike('email', email).not('cq_received_at', 'is', null).order('cq_received_at', { ascending: false }).limit(1);
    candidateQuery = scope(candidateQuery, ctx);
    const nativeCandidate = await candidateQuery;
    if (nativeCandidate.error) return res.status(500).json({ error: nativeCandidate.error.message });
    let candidate = nativeCandidate.data?.[0] || null;
    if (!candidate && b.slot_start && !Number.isNaN(new Date(b.slot_start).getTime())) {
      let overrideQuery = db.from('meeting_status_overrides').select('cq_received_at,updated_by').ilike('email', email).eq('slot_start', new Date(b.slot_start).toISOString()).not('cq_received_at', 'is', null).limit(1);
      if (!ctx.perms.meetings_view_all) overrideQuery = overrideQuery.ilike('updated_by', ctx.email);
      const override = await overrideQuery.maybeSingle();
      if (override.error) return res.status(500).json({ error: override.error.message });
      if (override.data) candidate = { cq_received_at: override.data.cq_received_at, lead_id: null };
    }
    if (!candidate) return res.status(403).json({ error: 'Candidate access or CQ receipt could not be verified.' });

    let verifiedLead = null;
    if (b.lead_id) {
      if (!UUID_RE.test(clean(b.lead_id))) return res.status(400).json({ error: 'Candidate record is invalid.' });
      const leadResult = await db.from('leads').select('id,email,phone,first_name,last_name').eq('id', clean(b.lead_id)).ilike('email', email).maybeSingle();
      if (leadResult.error) return res.status(500).json({ error: leadResult.error.message });
      if (!leadResult.data) return res.status(403).json({ error: 'Candidate record does not match this meeting.' });
      verifiedLead = leadResult.data;
    } else if (candidate.lead_id) {
      const leadResult = await db.from('leads').select('id,email,phone,first_name,last_name').eq('id', candidate.lead_id).ilike('email', email).maybeSingle();
      if (leadResult.error) return res.status(500).json({ error: leadResult.error.message });
      verifiedLead = leadResult.data || null;
    }
    if (!ctx.perms.meetings_view_all) {
      if (!ctx.assignees.includes(assigned)) return res.status(403).json({ error: 'You cannot assign this deal to another consultant.' });
      assigned = ctx.email;
    } else {
      let member = await db.from('team_members').select('email,active').eq('email', assigned).maybeSingle();
      if (!member.data) member = await db.from('team_members').select('email,active').eq('name', clean(b.assigned_to_email)).maybeSingle();
      if (member.error) return res.status(500).json({ error: member.error.message });
      if (!member.data?.active) return res.status(400).json({ error: 'Deals must be assigned to an active consultant.' });
      assigned = member.data.email.toLowerCase();
    }
    const requestKey = UUID_RE.test(clean(b.request_key)) ? clean(b.request_key) : crypto.randomUUID();
    const result = await db.rpc('create_deal_with_followup', {
      p_deal: { lead_id: verifiedLead?.id || null, email, phone: clean(verifiedLead?.phone) || clean(b.phone) || null, first_name: clean(verifiedLead?.first_name) || clean(b.first_name), last_name: clean(verifiedLead?.last_name) || clean(b.last_name), brand, stage: b.stage || 'cq_received', assigned_to_email: assigned, developer_name: clean(b.developer_name) || null, developer_email: clean(b.developer_email) || null, developer_phone: clean(b.developer_phone) || null, units: clean(b.units) || null, estimated_deal_value: b.estimated_deal_value === '' ? null : b.estimated_deal_value, current_blocker: clean(b.current_blocker) || null, cq_received_at: candidate.cq_received_at, submitted_at: b.submitted ? new Date().toISOString() : null, introduction_at: b.introduced ? new Date().toISOString() : null },
      p_followup: { due_at: dueAt, note: clean(b.note) || 'Check in after franchise submission', contact_target: target, request_key: requestKey },
    });
    if (result.error) return res.status(result.error.code === '23505' ? 409 : 500).json({ error: result.error.code === '23505' ? 'An active deal already exists for this candidate and brand.' : result.error.message });
    return res.status(201).json(result.data);
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    if (b.action === 'edit') {
      const found = await ownedDeal(db, b.deal_id, ctx); if (found.error) return res.status(500).json({ error: found.error.message }); if (!found.data) return res.status(404).json({ error: 'Deal not found.' });
      if (b.stage && !MANUAL_STAGES.includes(b.stage) && !(b.stage === 'closed' && ['won','lost'].includes(found.data.status))) return res.status(400).json({ error: 'Invalid stage.' });
      if (!validEmail(clean(b.developer_email))) return res.status(400).json({ error: 'Developer email is invalid.' });
      if (b.estimated_deal_value !== '' && b.estimated_deal_value != null && (!Number.isFinite(Number(b.estimated_deal_value)) || Number(b.estimated_deal_value) < 0)) return res.status(400).json({ error: 'Estimated commission must be a positive number.' });
      const update = { brand: clean(b.brand) || found.data.brand, developer_name: clean(b.developer_name) || null, developer_email: clean(b.developer_email) || null, developer_phone: clean(b.developer_phone) || null, units: clean(b.units) || null, estimated_deal_value: b.estimated_deal_value === '' ? null : b.estimated_deal_value, current_blocker: clean(b.current_blocker) || null, stage: b.stage || found.data.stage, submitted_at: b.submitted === true && !found.data.submitted_at ? new Date().toISOString() : found.data.submitted_at, introduction_at: b.introduced === true && !found.data.introduction_at ? new Date().toISOString() : found.data.introduction_at, updated_at: new Date().toISOString() };
      const saved = await db.from('deals').update(update).eq('id', found.data.id).eq('assigned_to_email', found.data.assigned_to_email).select().single();
      return saved.error ? res.status(saved.error.code === '23505' ? 409 : 500).json({ error: saved.error.message }) : res.json({ deal: saved.data });
    }
    if (b.action === 'lifecycle') {
      if (!DEAL_STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid deal status.' });
      const found = await ownedDeal(db, b.deal_id, ctx); if (found.error) return res.status(500).json({ error: found.error.message }); if (!found.data) return res.status(404).json({ error: 'Deal not found.' });
      const dueAt = b.status === 'active' ? parseFuture(b.due_at) : null;
      if (b.status === 'active' && !dueAt) return res.status(400).json({ error: 'Resuming requires a future next action.' });
      const changed = await db.rpc('change_deal_lifecycle', { p_deal_id: found.data.id, p_status: b.status, p_reason: clean(b.reason) || null, p_due_at: dueAt, p_request_key: UUID_RE.test(clean(b.request_key)) ? clean(b.request_key) : crypto.randomUUID() });
      return changed.error ? res.status(500).json({ error: changed.error.message }) : res.json(changed.data);
    }
    let query = db.from('deal_followups').select('*,deal:deals!inner(*)').eq('id', b.followup_id);
    query = scope(query, ctx);
    const found = await query.maybeSingle();
    if (found.error) return res.status(500).json({ error: found.error.message });
    if (!found.data) return res.status(404).json({ error: 'Follow-up not found.' });
    if (b.action === 'snooze') {
      if (found.data.status !== 'pending') return res.status(409).json({ error: 'Only pending follow-ups can be snoozed.' });
      const dueAt = parseFuture(b.due_at); if (!dueAt) return res.status(400).json({ error: 'Choose a valid future snooze time within one year.' });
      const saved = await db.from('deal_followups').update({ due_at: dueAt, updated_at: new Date().toISOString() }).eq('id', found.data.id).eq('status', 'pending').eq('assigned_to_email', found.data.assigned_to_email).select().single();
      return saved.error ? res.status(500).json({ error: saved.error.message }) : res.json({ followup: saved.data });
    }
    if (b.action === 'complete') {
      if (!OUTCOMES.includes(b.outcome) || !ACTIONS.includes(b.action_type || 'follow_up') || !FOLLOWUP_TARGETS.includes(b.next_contact_target || 'candidate')) return res.status(400).json({ error: 'Invalid follow-up details.' });
      const dueAt = parseFuture(b.next_due_at); if (!dueAt || !clean(b.next_note)) return res.status(400).json({ error: 'A future date and “What should I do next?” are required.' });
      const completed = await db.rpc('complete_deal_followup', { p_followup_id: found.data.id, p_request_key: UUID_RE.test(clean(b.request_key)) ? clean(b.request_key) : crypto.randomUUID(), p_outcome: b.outcome, p_note: clean(b.note) || null, p_next_note: clean(b.next_note), p_next_due_at: dueAt, p_contact_target: b.next_contact_target || 'candidate' });
      return completed.error ? res.status(500).json({ error: completed.error.message }) : res.json(completed.data);
    }
    return res.status(400).json({ error: 'Unknown action.' });
  }
  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).end();
}
