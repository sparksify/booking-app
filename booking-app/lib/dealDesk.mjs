export const DEFAULT_DEAL_TIMEZONE = 'America/Chicago';
export const DEAL_STATUSES = ['active', 'won', 'lost', 'paused'];
export const DEAL_STAGES = ['cq_received', 'submitted', 'brand_contact', 'education', 'validation', 'discovery_day', 'decision', 'closed'];
export const FOLLOWUP_TARGETS = ['candidate', 'developer'];

export const OUTCOME_STAGE = {
  waiting_on_developer: 'brand_contact',
  validation_scheduled: 'validation',
  discovery_day_scheduled: 'discovery_day',
  decision_pending: 'decision',
};

function parts(date, timeZone) {
  const values = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).forEach(p => { if (p.type !== 'literal') values[p.type] = Number(p.value); });
  return values;
}

/** Convert timezone wall-clock components to an absolute Date, including DST. */
export function zonedDateTime({ year, month, day, hour = 10, minute = 0 }, timeZone = DEFAULT_DEAL_TIMEZONE) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const p = parts(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += Date.UTC(year, month - 1, day, hour, minute, 0) - shown;
  }
  return new Date(guess);
}

export function wallClockValue(date, timeZone = DEFAULT_DEAL_TIMEZONE) {
  const p = parts(new Date(date), timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function parseWallClock(value, timeZone = DEFAULT_DEAL_TIMEZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const result = zonedDateTime({ year: y, month: m, day: d, hour: h, minute: min }, timeZone);
  return Number.isNaN(result.getTime()) || wallClockValue(result, timeZone) !== value ? null : result;
}

export function addDaysAtWorkTime(days, base = new Date(), timeZone = DEFAULT_DEAL_TIMEZONE, hour = 10) {
  const p = parts(new Date(base), timeZone);
  const noon = new Date(Date.UTC(p.year, p.month - 1, p.day + Number(days), 12));
  const next = parts(noon, 'UTC');
  return zonedDateTime({ year: next.year, month: next.month, day: next.day, hour }, timeZone);
}

export function addBusinessDays(days, base = new Date(), timeZone = DEFAULT_DEAL_TIMEZONE, hour = 10) {
  let d = addDaysAtWorkTime(0, base, timeZone, hour);
  let left = Number(days);
  while (left > 0) {
    d = addDaysAtWorkTime(1, d, timeZone, hour);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
    if (weekday !== 'Sat' && weekday !== 'Sun') left -= 1;
  }
  return d;
}

export function suggestFollowupGaps({ day, meetings = [], followups = [], workStart = 9, workEnd = 18, timeZone = DEFAULT_DEAL_TIMEZONE }) {
  const dayValue = wallClockValue(day, timeZone).slice(0, 10);
  const start = parseWallClock(`${dayValue}T${String(workStart).padStart(2, '0')}:00`, timeZone);
  const end = parseWallClock(`${dayValue}T${String(workEnd).padStart(2, '0')}:00`, timeZone);
  if (!start || !end) return [];
  const occupied = [
    ...meetings.map(m => [new Date(m.slot_start), new Date(m.slot_end || new Date(m.slot_start).getTime() + 30 * 60000)]),
    ...followups.map(f => [new Date(f.due_at), new Date(new Date(f.due_at).getTime() + 15 * 60000)]),
  ];
  const suggestions = [];
  for (let t = start.getTime(); t + 15 * 60000 <= end.getTime(); t += 15 * 60000) {
    const finish = t + 15 * 60000;
    if (t > Date.now() && !occupied.some(([a, b]) => t < b.getTime() && finish > a.getTime())) suggestions.push(new Date(t));
    if (suggestions.length === 3) break;
  }
  return suggestions;
}

export function overdueLabel(dueAt, now = new Date()) {
  const milliseconds = new Date(now).getTime() - new Date(dueAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '';
  const minutes = Math.max(1, Math.floor(milliseconds / 60000));
  if (minutes < 60) return `OVERDUE ${minutes} MIN`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `OVERDUE ${hours} HR`;
  const days = Math.floor(hours / 24);
  return `OVERDUE ${days} DAY${days === 1 ? '' : 'S'}`;
}
