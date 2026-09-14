/**
 * DealOS domain constants — shared by the attention engine, APIs, and UI.
 *
 * A candidate (nurture_clients) can have multiple independent deals
 * (nurture_brands), each with its own universal status and workflow.
 * Granular franchisor-specific process steps live in nurture_deal_events;
 * the statuses below are intentionally broad so different franchisors can
 * run different processes underneath them.
 */

export const DEAL_STATUSES = {
  new:              { label: 'New (CQ Received)', short: 'New',        color: '#9F1239', bg: '#FFF1F2', border: '#FECDD3', order: 0, open: true },
  submitted:        { label: 'Submitted',         short: 'Submitted',  color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA', order: 1, open: true },
  connected:        { label: 'Connected',         short: 'Connected',  color: '#A16207', bg: '#FEFCE8', border: '#FDE68A', order: 2, open: true },
  due_diligence:    { label: 'Due Diligence',     short: 'Due Dil.',   color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', order: 3, open: true },
  final_evaluation: { label: 'Final Evaluation',  short: 'Final Eval', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', order: 4, open: true },
  decision:         { label: 'Decision',          short: 'Decision',   color: '#0E7490', bg: '#ECFEFF', border: '#A5F3FC', order: 5, open: true },
  signed:           { label: 'Signed',            short: 'Signed',     color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0', order: 6, open: true },
  paid:             { label: 'Paid',              short: 'Paid',       color: '#166534', bg: '#DCFCE7', border: '#86EFAC', order: 7, open: false },
  closed:           { label: 'Closed',            short: 'Closed',     color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB', order: 8, open: false },
};

export const OPEN_STATUSES = Object.keys(DEAL_STATUSES).filter(k => DEAL_STATUSES[k].open);

export const DEAL_OUTCOMES = {
  won:       { label: 'Won',       color: '#15803D', bg: '#DCFCE7' },
  lost:      { label: 'Lost',      color: '#B91C1C', bg: '#FEE2E2' },
  withdrawn: { label: 'Withdrawn', color: '#6B7280', bg: '#F3F4F6' },
};

export const SENTIMENTS = {
  positive: { label: 'Positive', emoji: '👍', color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  neutral:  { label: 'Neutral',  emoji: '😐', color: '#92400E', bg: '#FEF3C7', border: '#FCD34D' },
  concerns: { label: 'Concerns', emoji: '⚠️', color: '#B45309', bg: '#FEF9C3', border: '#FDE047' },
  passed:   { label: 'Passed',   emoji: '❌', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
};

export const EVENT_TYPES = {
  intro_call:       { label: 'Intro Call',            finalEval: false },
  unit_economics:   { label: 'Unit Economics Call',   finalEval: false },
  fdd_review:       { label: 'FDD Review',            finalEval: false },
  validation:       { label: 'Validation',            finalEval: false },
  discovery_day:    { label: 'Discovery Day',         finalEval: true },
  confirmation_day: { label: 'Confirmation Day',      finalEval: true },
  funding_intro:    { label: 'Funding Introduction',  finalEval: false },
  attorney_intro:   { label: 'Attorney Introduction', finalEval: false },
  award:            { label: 'Award',                 finalEval: false },
  agreement_sent:   { label: 'Agreement Sent',        finalEval: false },
  signing:          { label: 'Signing',               finalEval: false },
  other:            { label: 'Event',                 finalEval: false },
};

export const NEXT_ACTION_TYPES = {
  call:    { label: 'Call',    icon: '📞' },
  text:    { label: 'Text',    icon: '💬' },
  email:   { label: 'Email',   icon: '✉️' },
  meeting: { label: 'Meeting', icon: '🗓' },
  task:    { label: 'Task',    icon: '☑️' },
};

/** Expected response windows (days) before a waiting-on item needs a nudge. */
export const WAITING_WINDOWS_DAYS = {
  candidate: 3,
  developer: 4,
  franchisor: 7,
  funding: 5,
  attorney: 7,
  other: 5,
};

export const WAITING_LABELS = {
  candidate: 'Candidate',
  developer: 'Developer',
  franchisor: 'Franchisor',
  funding: 'Funding partner',
  attorney: 'Attorney',
  other: 'Other',
};

/** Contact-overdue fallback thresholds (days). */
export const CONTACT_OVERDUE_DAYS = { candidate: 7, developer: 10 };

/** No status movement + no contact for this many days = stalled. */
export const STALLED_AFTER_DAYS = 21;

/** Days after submission without confirmed developer connection before we flag it. */
export const CONNECTION_LAG_DAYS = 3;

/** Look-ahead window (days) for funding/attorney readiness before a final evaluation. */
export const FINAL_EVAL_READINESS_DAYS = 14;

/** Days after a completed event during which a debrief is expected. */
export const DEBRIEF_WINDOW_DAYS = 5;

/** Days after award/agreement without signing before we flag follow-through. */
export const SIGNING_FOLLOWUP_DAYS = 4;

export function statusInfo(status) {
  return DEAL_STATUSES[status] || DEAL_STATUSES.new;
}

export function daysBetween(from, to = Date.now()) {
  if (!from) return null;
  const t = typeof from === 'string' ? new Date(from).getTime() : from.getTime?.() ?? from;
  if (!Number.isFinite(t)) return null;
  return Math.floor(((typeof to === 'number' ? to : to.getTime()) - t) / 86400000);
}

export function fmtMoney(n) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return null;
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
