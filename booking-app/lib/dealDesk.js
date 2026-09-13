export const OUTCOME_STAGE = {
  'waiting_on_developer': 'brand_contact',
  'validation_scheduled': 'validation',
  'discovery_day_scheduled': 'discovery_day',
  'decision_pending': 'decision',
};

export function atWorkTime(date, hour = 10) {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function addDaysAtWorkTime(days, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + Number(days));
  return atWorkTime(d);
}

export function addBusinessDays(days, base = new Date()) {
  const d = new Date(base);
  let remaining = Number(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining -= 1;
  }
  return atWorkTime(d);
}
