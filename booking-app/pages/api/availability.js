import { getSupabaseAdmin } from '@/lib/supabase';
import { getBusyByMemberRange, generateSlots } from '@/lib/googleCalendar';
import { getBrandBySlug } from '@/lib/routing';

const DEFAULTS = {
  workStart: 9,
  workEnd: 18,
  timezone: 'America/Chicago',
  meetingDuration: 15,
  bufferMinutes: 15,
};

// Returns UTC offset in minutes for a timezone on a given date (e.g. -300 for CDT)
function getOffsetMinutes(dateStr, timezone) {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const str = probe.toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' });
  const match = str.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign  = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const mins  = parseInt(match[3] || '0', 10);
  return sign * (hours * 60 + mins);
}

function localToUTCMs(dateStr, h, m, offsetMins) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, h, m, 0) - offsetMins * 60_000;
}

/**
 * GET /api/availability?date=YYYY-MM-DD[&investment_level=100k_250k]
 *
 * Returns available time slots for the given date.
 * If investment_level is provided, only considers reps whose investment_ranges
 * array includes that level (or reps with an empty array = handles all levels).
 * Falls back to mock slots when no calendars are connected.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { date, investment_level, brand: brandSlug } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' });
  }

  // Skip weekends
  const dow = new Date(date + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) return res.json({ slots: [] });

  const supabase = getSupabaseAdmin();

  // Load global settings + optional brand config in parallel
  const [{ data: settingsRow }, brand] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 1).single(),
    brandSlug ? getBrandBySlug(brandSlug, supabase) : Promise.resolve(null),
  ]);

  const settings = settingsRow
    ? {
        workStart:        settingsRow.work_start,
        workEnd:          settingsRow.work_end,
        timezone:         settingsRow.timezone,
        // Brand overrides meeting duration; global otherwise
        meetingDuration:  brand?.meeting_duration ?? settingsRow.meeting_duration,
        bufferMinutes:    settingsRow.buffer_minutes,
        meetingTitle:     brand?.meeting_title ?? settingsRow.meeting_title,
        maxSlotsPerDay:   settingsRow.max_slots_per_day  ?? 15,
        hiddenSlotsCount: settingsRow.hidden_slots_count ?? 1,
      }
    : { ...DEFAULTS, maxSlotsPerDay: 15, hiddenSlotsCount: 1 };

  // Load active team members with tokens
  const { data: allMembers } = await supabase
    .from('team_members')
    .select('email, name, calendar_id, google_access_token, google_refresh_token, investment_ranges')
    .eq('active', true)
    .not('google_refresh_token', 'is', null);

  // If brand is specified, restrict to brand's assigned reps
  // Otherwise filter by investment_level using the existing investment_ranges system
  let members;
  if (brand && brand.rep_emails && brand.rep_emails.length > 0) {
    const brandRepSet = new Set(brand.rep_emails);
    members = (allMembers || []).filter(m => brandRepSet.has(m.email));
  } else {
    members = filterByInvestmentLevel(allMembers || [], investment_level);
  }

  // No connected / matching calendars → return demo slots
  if (!members.length) {
    let demoSlots = mockSlots(settings, date);
    const todayStr = new Date().toISOString().slice(0, 10);
    if (date === todayStr) {
      const cutoffMs  = Date.now() + 30 * 60_000;
      const offsetMins = getOffsetMinutes(date, settings.timezone || 'America/Chicago');
      demoSlots = demoSlots.filter(sl => {
        const [y, mo, d2] = date.split('-').map(Number);
        const slotUtcMs = Date.UTC(y, mo - 1, d2, sl.h, sl.m, 0) - offsetMins * 60_000;
        return slotUtcMs >= cutoffMs;
      });
    }
    return res.json({ slots: demoSlots, demo: true });
  }

  try {
    // 1. Per-rep busy times. A slot is available if AT LEAST ONE rep is free
    //    (union) — so a rep who's fully booked doesn't hide another rep's open
    //    times on a shared brand calendar.
    const busyByMember = await getBusyByMemberRange(members, date, date, settings.timezone);

    // 2. Also check our own Supabase bookings — reliable source of truth for
    //    app-made bookings. Each only blocks the rep it's assigned to.
    const offsetMins = getOffsetMinutes(date, settings.timezone);
    const timeMin = new Date(localToUTCMs(date,  0,  0, offsetMins)).toISOString();
    const timeMax = new Date(localToUTCMs(date, 23, 59, offsetMins)).toISOString();

    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('slot_start, slot_end, assigned_to_email')
      .gte('slot_start', timeMin)
      .lte('slot_start', timeMax)
      .neq('status', 'cancelled');

    const bookingsByEmail = {};
    for (const b of existingBookings || []) {
      const em = (b.assigned_to_email || '').toLowerCase();
      (bookingsByEmail[em] = bookingsByEmail[em] || []).push({ start: b.slot_start, end: b.slot_end });
    }

    // 3. Union each rep's free slots — a time is offered if any rep can take it.
    const slotByKey = new Map();
    for (const mem of members) {
      const memberBusy = [
        ...(busyByMember[mem.email] || []),
        ...(bookingsByEmail[(mem.email || '').toLowerCase()] || []),
      ];
      for (const sl of generateSlots(settings, memberBusy, date)) {
        slotByKey.set(`${sl.h}:${sl.m}`, sl);
      }
    }
    let slots = [...slotByKey.values()].sort((a, b) => (a.h * 60 + a.m) - (b.h * 60 + b.m));

    // 4. For today: strip slots that have already passed (+ 30-min booking buffer)
    const todayStr = new Date().toISOString().slice(0, 10);
    if (date === todayStr) {
      const cutoffMs = Date.now() + 30 * 60_000; // must be at least 30 min from now
      const offsetMins = getOffsetMinutes(date, settings.timezone || 'America/Chicago');
      slots = slots.filter(sl => {
        const [y, mo, d2] = date.split('-').map(Number);
        const slotUtcMs = Date.UTC(y, mo - 1, d2, sl.h, sl.m, 0) - offsetMins * 60_000;
        return slotUtcMs >= cutoffMs;
      });
    }

    const visible = applySlotDisplay(slots, date, settings.maxSlotsPerDay, settings.hiddenSlotsCount);

    res.setHeader('Cache-Control', 'no-store');
    return res.json({ slots: visible });
  } catch (err) {
    console.error('[availability] error:', err.message);
    return res.json({ slots: mockSlots(settings, date), demo: true, error: err.message });
  }
}

// ─── Slot display limiting + scarcity hiding ──────────────────────────────────

/**
 * Removes `hiddenCount` slots at random (seeded by dateStr so results are
 * consistent for the same day but vary across days), then caps at `maxSlots`.
 */
function applySlotDisplay(slots, dateStr, maxSlots = 15, hiddenCount = 1) {
  if (!slots.length) return slots;

  // Seeded RNG so the same date always hides the same slot(s)
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = Math.imul(31, seed) + dateStr.charCodeAt(i) | 0;
  }
  const rng = () => {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0xffffffff;
  };

  const result = [...slots];
  const toHide = Math.min(hiddenCount, Math.max(0, result.length - 1)); // always keep at least 1
  for (let i = 0; i < toHide; i++) {
    const idx = Math.floor(rng() * result.length);
    result.splice(idx, 1);
  }

  return result.slice(0, maxSlots);
}

// ─── Routing helpers ──────────────────────────────────────────────────────────

function filterByInvestmentLevel(members, investmentLevel) {
  if (!investmentLevel) return members; // no filter — use all
  return members.filter(m => {
    const ranges = m.investment_ranges;
    // Empty / null → rep handles all levels
    if (!ranges || ranges.length === 0) return true;
    return ranges.includes(investmentLevel);
  });
}

// ─── Mock slot generator ──────────────────────────────────────────────────────

function mockSlots(settings, dateStr) {
  const { workStart, workEnd } = settings;
  const slots = [];
  const seed = dateStr.replace(/-/g, '');
  let rng = parseInt(seed, 10);
  const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 0xffffffff; };

  for (let h = workStart; h < workEnd; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (rand() > 0.3) {
        const p  = h >= 12 ? 'PM' : 'AM';
        const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
        slots.push({ h, m, label: `${dh}:${String(m).padStart(2, '0')} ${p}` });
      }
    }
  }
  return slots;
}
