import { getSupabaseAdmin } from '@/lib/supabase';
import { getBusyTimesRange, generateSlots } from '@/lib/googleCalendar';
import { getBrandBySlug } from '@/lib/routing';

const DEFAULTS = { workStart: 9, workEnd: 18, timezone: 'America/Chicago', meetingDuration: 15, bufferMinutes: 15 };

function getOffsetMinutes(dateStr, timezone) {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const str = probe.toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' });
  const match = str.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3] || '0', 10));
}
function localToUTCMs(dateStr, h, m, offsetMins) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, h, m, 0) - offsetMins * 60_000;
}

/**
 * GET /api/availability-range?dates=YYYY-MM-DD,YYYY-MM-DD,...[&brand=&investment_level=]
 *
 * Returns availability for many days in ONE request, using a single Google
 * free/busy query per rep across the whole window. Response: { days: { dateStr: [slots] } }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { dates, investment_level, brand: brandSlug } = req.query;
  const requested = (dates || '').split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
  // Skip weekends
  const workDates = requested.filter(d => { const dow = new Date(d + 'T12:00:00').getDay(); return dow !== 0 && dow !== 6; });
  if (!workDates.length) return res.json({ days: {} });

  const sorted = [...workDates].sort();
  const fromDate = sorted[0];
  const toDate = sorted[sorted.length - 1];

  const supabase = getSupabaseAdmin();
  const [{ data: settingsRow }, brand] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 1).single(),
    brandSlug ? getBrandBySlug(brandSlug, supabase) : Promise.resolve(null),
  ]);

  const settings = settingsRow ? {
    workStart: settingsRow.work_start, workEnd: settingsRow.work_end, timezone: settingsRow.timezone,
    meetingDuration: brand?.meeting_duration ?? settingsRow.meeting_duration,
    bufferMinutes: settingsRow.buffer_minutes,
    maxSlotsPerDay: settingsRow.max_slots_per_day ?? 15,
    hiddenSlotsCount: settingsRow.hidden_slots_count ?? 1,
  } : { ...DEFAULTS, maxSlotsPerDay: 15, hiddenSlotsCount: 1 };

  const { data: allMembers } = await supabase
    .from('team_members')
    .select('email, name, calendar_id, google_access_token, google_refresh_token, investment_ranges')
    .eq('active', true)
    .not('google_refresh_token', 'is', null);

  let members;
  if (brand && brand.rep_emails && brand.rep_emails.length > 0) {
    const set = new Set(brand.rep_emails);
    members = (allMembers || []).filter(m => set.has(m.email));
  } else {
    members = filterByInvestmentLevel(allMembers || [], investment_level);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const stripPast = (slots, d) => {
    if (d !== todayStr) return slots;
    const cutoffMs = Date.now() + 30 * 60_000;
    const off = getOffsetMinutes(d, settings.timezone || 'America/Chicago');
    return slots.filter(sl => {
      const [y, mo, d2] = d.split('-').map(Number);
      return (Date.UTC(y, mo - 1, d2, sl.h, sl.m, 0) - off * 60_000) >= cutoffMs;
    });
  };

  if (!members.length) {
    const days = {};
    for (const d of workDates) days[d] = stripPast(mockSlots(settings, d), d);
    return res.json({ days, demo: true });
  }

  try {
    const googleBusy = await getBusyTimesRange(members, fromDate, toDate, settings.timezone);

    const offFrom = getOffsetMinutes(fromDate, settings.timezone);
    const offTo = getOffsetMinutes(toDate, settings.timezone);
    const timeMin = new Date(localToUTCMs(fromDate, 0, 0, offFrom)).toISOString();
    const timeMax = new Date(localToUTCMs(toDate, 23, 59, offTo)).toISOString();
    const { data: existingBookings } = await supabase
      .from('bookings').select('slot_start, slot_end')
      .gte('slot_start', timeMin).lte('slot_start', timeMax).neq('status', 'cancelled');
    const supabaseBusy = (existingBookings || []).map(b => ({ start: b.slot_start, end: b.slot_end }));
    const allBusy = [...googleBusy, ...supabaseBusy];

    const days = {};
    for (const d of workDates) {
      let slots = generateSlots(settings, allBusy, d);
      slots = stripPast(slots, d);
      days[d] = applySlotDisplay(slots, d, settings.maxSlotsPerDay, settings.hiddenSlotsCount);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ days });
  } catch (err) {
    console.error('[availability-range] error:', err.message);
    const days = {};
    for (const d of workDates) days[d] = stripPast(mockSlots(settings, d), d);
    return res.json({ days, demo: true, error: err.message });
  }
}

// ─── helpers (kept local to avoid touching the working single-day endpoint) ─────
function applySlotDisplay(slots, dateStr, maxSlots = 15, hiddenCount = 1) {
  if (!slots.length) return slots;
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) seed = Math.imul(31, seed) + dateStr.charCodeAt(i) | 0;
  const rng = () => { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return (seed >>> 0) / 0xffffffff; };
  const result = [...slots];
  const toHide = Math.min(hiddenCount, Math.max(0, result.length - 1));
  for (let i = 0; i < toHide; i++) result.splice(Math.floor(rng() * result.length), 1);
  return result.slice(0, maxSlots);
}
function filterByInvestmentLevel(members, investmentLevel) {
  if (!investmentLevel) return members;
  return members.filter(m => { const r = m.investment_ranges; if (!r || r.length === 0) return true; return r.includes(investmentLevel); });
}
function mockSlots(settings, dateStr) {
  const { workStart, workEnd } = settings;
  const slots = [];
  let rng = parseInt(dateStr.replace(/-/g, ''), 10);
  const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 0xffffffff; };
  for (let h = workStart; h < workEnd; h++) for (let m = 0; m < 60; m += 15) {
    if (rand() > 0.3) { const p = h >= 12 ? 'PM' : 'AM'; const dh = h > 12 ? h - 12 : h === 0 ? 12 : h; slots.push({ h, m, label: `${dh}:${String(m).padStart(2, '0')} ${p}` }); }
  }
  return slots;
}
