import { getSupabaseAdmin } from '@/lib/supabase';
import { getBusyTimes, generateSlots } from '@/lib/googleCalendar';

const DEFAULTS = {
  workStart: 9,
  workEnd: 18,
  timezone: 'America/Chicago',
  meetingDuration: 15,
  bufferMinutes: 15,
};

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

  const { date, investment_level } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' });
  }

  // Skip weekends
  const dow = new Date(date + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) return res.json({ slots: [] });

  const supabase = getSupabaseAdmin();

  // Load settings
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();

  const settings = settingsRow
    ? {
        workStart:       settingsRow.work_start,
        workEnd:         settingsRow.work_end,
        timezone:        settingsRow.timezone,
        meetingDuration: settingsRow.meeting_duration,
        bufferMinutes:   settingsRow.buffer_minutes,
        meetingTitle:    settingsRow.meeting_title,
      }
    : DEFAULTS;

  // Load active team members with tokens
  const { data: allMembers } = await supabase
    .from('team_members')
    .select('email, name, calendar_id, google_access_token, google_refresh_token, investment_ranges')
    .eq('active', true)
    .not('google_refresh_token', 'is', null);

  // Filter by investment level if provided
  // A rep qualifies if:
  //   - their investment_ranges is null/empty (handles all levels), OR
  //   - their investment_ranges includes the requested level
  const members = filterByInvestmentLevel(allMembers || [], investment_level);

  // No connected / matching calendars → return demo slots
  if (!members.length) {
    return res.json({ slots: mockSlots(settings, date), demo: true });
  }

  try {
    const busyTimes = await getBusyTimes(members, date, settings.timezone);
    const slots     = generateSlots(settings, busyTimes, date);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ slots });
  } catch (err) {
    console.error('[availability] Google Calendar error:', err.message);
    return res.json({ slots: mockSlots(settings, date), demo: true, error: err.message });
  }
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
