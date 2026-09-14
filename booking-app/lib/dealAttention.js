/**
 * Deal Attention Engine — deterministic, server-side, no AI.
 *
 * Evaluates one deal against explicit events, due dates, and rules and returns
 * attention items. Every item carries the three DealOS concepts:
 *   ACTION    — what to do (type + label, actionable via call/text/email)
 *   REASON    — why DealOS surfaced it
 *   OBJECTIVE — what the consultant should accomplish in the interaction
 *
 * days-since-contact remains only a fallback signal (lowest-priority rules).
 * Lower priority number = more urgent. `jeopardy` marks items that put the
 * deal's commission at risk (rolled up into "commission at risk").
 */
import {
  EVENT_TYPES,
  WAITING_WINDOWS_DAYS,
  WAITING_LABELS,
  CONTACT_OVERDUE_DAYS,
  STALLED_AFTER_DAYS,
  CONNECTION_LAG_DAYS,
  FINAL_EVAL_READINESS_DAYS,
  DEBRIEF_WINDOW_DAYS,
  SIGNING_FOLLOWUP_DAYS,
  daysBetween,
} from './dealos';

const OPEN = ['new', 'submitted', 'connected', 'due_diligence', 'final_evaluation', 'decision', 'signed'];

function eventLabel(ev) {
  return ev.title || EVENT_TYPES[ev.event_type]?.label || 'Event';
}

function ago(days) {
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * @param {object} args
 * @param {object} args.deal            nurture_brands row (with DealOS columns)
 * @param {object} args.client          nurture_clients row
 * @param {Array}  args.events          nurture_deal_events rows for this deal
 * @param {string|null} args.lastCandidateContactAt  resolved from touchpoints + columns
 * @param {string|null} args.lastDeveloperContactAt
 * @param {number} [args.now]           ms epoch (injectable for tests)
 * @returns {Array} attention items, sorted most-urgent first
 */
export function evaluateDeal({ deal, client, events = [], lastCandidateContactAt, lastDeveloperContactAt, now = Date.now() }) {
  const items = [];
  if (!deal || deal.outcome || !OPEN.includes(deal.deal_status)) return items;
  if (client && client.status !== 'active') return items;

  const first = client?.first_name || 'the candidate';
  const brand = deal.brand_name || 'the brand';
  const dev = deal.developer_name ? deal.developer_name : `the ${brand} developer`;
  const milestones = client?.milestones || {};
  const fundingDone = !!(milestones.funding?.done || client?.funding_intro_done);
  const attorneyDone = !!milestones.attorney?.done;

  const candDays = daysBetween(lastCandidateContactAt, now);
  const devDays = daysBetween(lastDeveloperContactAt, now);

  // Completed events awaiting a candidate debrief (incl. Discovery Day-specific).
  for (const ev of events) {
    if (!ev.completed_at || ev.debrief_done) continue;
    const d = daysBetween(ev.completed_at, now);
    if (d === null || d > DEBRIEF_WINDOW_DAYS || d < 0) continue;
    const label = eventLabel(ev);
    const isFinalEval = EVENT_TYPES[ev.event_type]?.finalEval;
    items.push({
      rule: isFinalEval ? 'discovery_day_no_debrief' : 'event_debrief',
      priority: isFinalEval ? 8 : 10,
      jeopardy: true,
      due_at: ev.completed_at,
      action: { type: 'call', label: `Call ${first}` },
      reason: `${label} for ${brand} completed ${ago(d)} and no consultant debrief has occurred.`,
      objective: isFinalEval
        ? `Determine conviction after ${label}, identify concerns, and confirm the next franchisor step.`
        : `Debrief ${first} on the ${label}: gauge reaction, surface objections, and lock the next step with ${brand}.`,
    });
    break; // one debrief item per deal is enough
  }

  // Award / agreement without signing follow-through.
  const awardEv = events.find(ev =>
    ['award', 'agreement_sent'].includes(ev.event_type) && ev.completed_at);
  const signedEv = events.find(ev => ev.event_type === 'signing' && ev.completed_at);
  if (deal.deal_status !== 'signed' && awardEv && !signedEv) {
    const d = daysBetween(awardEv.completed_at, now);
    if (d !== null && d >= SIGNING_FOLLOWUP_DAYS) {
      items.push({
        rule: 'award_no_signing',
        priority: 9,
        jeopardy: true,
        due_at: awardEv.completed_at,
        action: { type: 'call', label: `Call ${first}` },
        reason: `${eventLabel(awardEv)} for ${brand} happened ${ago(d)} with no signing follow-through.`,
        objective: `Confirm ${first} is moving to signature, resolve any last hesitations, and pin down a signing date.`,
      });
    }
  }

  // Overdue explicit next action.
  if (deal.next_action_due_at && new Date(deal.next_action_due_at).getTime() <= now) {
    const d = daysBetween(deal.next_action_due_at, now);
    const type = deal.next_action_type || 'call';
    items.push({
      rule: 'next_action_overdue',
      priority: 12,
      jeopardy: d >= 2,
      due_at: deal.next_action_due_at,
      action: { type, label: `${type === 'task' ? 'Do' : type[0].toUpperCase() + type.slice(1)}${type === 'task' ? '' : ' ' + first}${type === 'task' ? ': ' + (deal.next_action_note || 'planned next action') : ''}` },
      reason: d <= 0
        ? `The planned next action on ${brand} is due today.`
        : `The planned next action on ${brand} is ${d} day${d === 1 ? '' : 's'} overdue.`,
      objective: deal.next_action_note || `Complete the planned next step and set the following one.`,
    });
  }

  // CQ received but candidate not submitted to the franchisor.
  if (deal.deal_status === 'new') {
    const d = daysBetween(deal.created_at, now);
    items.push({
      rule: 'cq_not_submitted',
      priority: 14,
      jeopardy: false,
      due_at: deal.created_at,
      action: { type: 'task', label: `Submit ${first} to ${brand}` },
      reason: `CQ was received ${ago(d)} but ${first} has not been submitted to ${brand}.`,
      objective: `Submit the candidate to the franchisor and set expectations with ${first} on what happens next.`,
    });
  }

  // Submitted but developer connection not confirmed.
  if (deal.deal_status === 'submitted' && !deal.connected_at) {
    const d = daysBetween(deal.submitted_at || deal.created_at, now);
    if (d !== null && d >= CONNECTION_LAG_DAYS) {
      items.push({
        rule: 'submitted_no_connection',
        priority: 16,
        jeopardy: false,
        due_at: deal.submitted_at || deal.created_at,
        action: { type: 'email', label: `Email ${dev}` },
        reason: `${first} was submitted to ${brand} ${ago(d)} and a developer connection hasn't been confirmed.`,
        objective: `Confirm the developer received the submission and get the intro call scheduled.`,
      });
    }
  }

  // Upcoming final evaluation without funding readiness / attorney intro.
  const upcomingFinal = events.find(ev =>
    EVENT_TYPES[ev.event_type]?.finalEval && ev.scheduled_at && !ev.completed_at &&
    daysBetween(now, new Date(ev.scheduled_at).getTime()) !== null &&
    new Date(ev.scheduled_at).getTime() > now &&
    daysBetween(now, new Date(ev.scheduled_at).getTime()) <= FINAL_EVAL_READINESS_DAYS);
  const finalEvalSoon = upcomingFinal ||
    (deal.next_event_at && new Date(deal.next_event_at).getTime() > now &&
      daysBetween(now, new Date(deal.next_event_at).getTime()) <= FINAL_EVAL_READINESS_DAYS &&
      EVENT_TYPES[deal.next_event_type]?.finalEval
      ? { event_type: deal.next_event_type, scheduled_at: deal.next_event_at }
      : null);
  if (finalEvalSoon) {
    const evName = EVENT_TYPES[finalEvalSoon.event_type]?.label || 'Final evaluation';
    const inDays = daysBetween(now, new Date(finalEvalSoon.scheduled_at).getTime());
    const when = inDays <= 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`;
    if (!fundingDone) {
      items.push({
        rule: 'final_eval_no_funding',
        priority: 11,
        jeopardy: true,
        due_at: finalEvalSoon.scheduled_at,
        action: { type: 'call', label: `Call ${first}` },
        reason: `${evName} for ${brand} is ${when} and funding readiness is not confirmed.`,
        objective: `Verify capital plan, make the funding partner introduction if needed, so financing can't derail ${evName}.`,
      });
    }
    if (!attorneyDone) {
      items.push({
        rule: 'final_eval_no_attorney',
        priority: 13,
        jeopardy: false,
        due_at: finalEvalSoon.scheduled_at,
        action: { type: 'email', label: `Email ${first}` },
        reason: `${evName} for ${brand} is ${when} and no attorney introduction has been made.`,
        objective: `Offer the franchise attorney introduction so FDD/agreement review doesn't stall the close.`,
      });
    }
  }

  // Waiting-on item beyond the expected response window.
  if (deal.waiting_on && deal.waiting_since) {
    const windowDays = WAITING_WINDOWS_DAYS[deal.waiting_on] ?? 5;
    const d = daysBetween(deal.waiting_since, now);
    if (d !== null && d > windowDays) {
      const who = WAITING_LABELS[deal.waiting_on] || deal.waiting_on;
      const target = deal.waiting_on === 'candidate' ? first
        : deal.waiting_on === 'developer' ? dev : who.toLowerCase();
      items.push({
        rule: 'waiting_overdue',
        priority: 18,
        jeopardy: true,
        due_at: deal.waiting_since,
        action: { type: deal.waiting_on === 'candidate' ? 'call' : 'email', label: `Nudge ${target}` },
        reason: `Waiting on ${who.toLowerCase()}${deal.waiting_note ? ` (${deal.waiting_note})` : ''} for ${d} days — past the ${windowDays}-day response window.`,
        objective: `Chase the outstanding item, get a firm date, and unblock the ${brand} deal.`,
      });
    }
  }

  // Stalled deal — explicitly parked, or no movement and no contact for a long time.
  const newestSignal = [deal.updated_at, lastCandidateContactAt, lastDeveloperContactAt]
    .filter(Boolean).map(t => new Date(t).getTime());
  const quietDays = newestSignal.length ? daysBetween(Math.max(...newestSignal), now) : null;
  if (deal.stalled_reason || (quietDays !== null && quietDays >= STALLED_AFTER_DAYS)) {
    items.push({
      rule: 'stalled_deal',
      priority: 20,
      jeopardy: true,
      due_at: null,
      action: { type: 'call', label: `Call ${first}` },
      reason: deal.stalled_reason
        ? `Deal marked stalled: ${deal.stalled_reason}.`
        : `No movement or contact on the ${brand} deal in ${quietDays} days.`,
      objective: `Diagnose what's blocking the deal, re-qualify commitment, and either restart momentum or set an outcome.`,
    });
  }

  // Fallback signals — contact overdue (no longer the primary mechanism).
  if (candDays === null || candDays >= CONTACT_OVERDUE_DAYS.candidate) {
    items.push({
      rule: 'candidate_contact_overdue',
      priority: 30,
      jeopardy: false,
      due_at: lastCandidateContactAt,
      action: { type: 'call', label: `Call ${first}` },
      reason: candDays === null
        ? `${first} has never been contacted on the ${brand} deal.`
        : `Last candidate contact was ${candDays} days ago.`,
      objective: `Re-engage ${first}, check temperature on ${brand}, and agree the next concrete step.`,
    });
  }
  if (deal.deal_status !== 'new' &&
      (devDays === null ? deal.connected_at || deal.developer_name : devDays >= CONTACT_OVERDUE_DAYS.developer)) {
    if (devDays === null || devDays >= CONTACT_OVERDUE_DAYS.developer) {
      items.push({
        rule: 'developer_contact_overdue',
        priority: 32,
        jeopardy: false,
        due_at: lastDeveloperContactAt,
        action: { type: 'email', label: `Email ${dev}` },
        reason: devDays === null
          ? `No developer contact has been logged for ${brand}.`
          : `Last developer contact was ${devDays} days ago.`,
        objective: `Get the franchisor's read on ${first}, align on process status, and keep the deal moving on their side.`,
      });
    }
  }

  items.sort((a, b) => a.priority - b.priority);
  return items;
}

/**
 * Convenience: the single top attention item for a deal (or null).
 */
export function topAttention(args) {
  const items = evaluateDeal(args);
  return items[0] || null;
}
