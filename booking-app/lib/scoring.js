/**
 * BookingOS — Lead Intelligence Scoring
 *
 * computeLeadScore(booking, lead)     → 0–100  (lead quality signal)
 * computeShowProbability(booking, lead) → 0–100 (% likelihood they show)
 * getHealthBadge(score, showProb)     → { emoji, label, color, bg }
 */

// ─── Investment level parser ──────────────────────────────────────────────────
// Normalises the various investment_level string formats into a USD midpoint.
// Returns null if unrecognisable.

function parseInvestmentUSD(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().replace(/[, ]/g, '');

  // Patterns: "100k_250k", "100k-250k", "$100k-$250k", "250k+", "200k+"
  const rangeMatch = s.match(/(\d+\.?\d*)k[_\-](\d+\.?\d*)k/);
  if (rangeMatch) {
    return ((parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2) * 1000;
  }

  const plusMatch = s.match(/(\d+\.?\d*)k\+/);
  if (plusMatch) return parseFloat(plusMatch[1]) * 1000 * 1.35; // estimate midpoint above floor

  const singleMatch = s.match(/(\d+\.?\d*)k/);
  if (singleMatch) return parseFloat(singleMatch[1]) * 1000;

  return null;
}

// ─── Raw field helpers ────────────────────────────────────────────────────────
// Facebook form raw_fields keys vary — do a loose keyword match.

function getField(raw, ...keywords) {
  if (!raw) return null;
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  for (const kw of keywords) {
    const slug = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
    const entry = Object.entries(obj).find(([k]) =>
      k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug)
    );
    if (entry) return entry[1];
  }
  return null;
}

function ownedBusiness(raw) {
  const val = getField(raw, 'owned_business', 'owned or managed', 'managed a business', 'business before');
  if (!val) return false;
  return /yes|true|1/i.test(String(val));
}

// ─── Lead Score (0–100) ───────────────────────────────────────────────────────
/**
 * Signals:
 *   Investment / liquid capital  — 40 pts
 *   Business ownership history   — 15 pts
 *   Booking urgency (days out)   — 25 pts
 *   Contact completeness         — 10 pts
 *   Source bonus                 — 10 pts
 */
export function computeLeadScore(booking, lead = null) {
  let score = 0;
  const raw = lead?.raw_fields ?? null;

  // ── Investment / capital (40 pts) ────────────────────────────────────────
  // Try liquid capital from raw fields first (more precise), fall back to
  // investment_level from the URL param.
  let capitalUSD =
    parseInvestmentUSD(getField(raw, 'liquid_capital', 'liquid capital')) ??
    parseInvestmentUSD(booking?.investment_level);

  if (capitalUSD != null) {
    if      (capitalUSD >= 250_000) score += 40;
    else if (capitalUSD >= 150_000) score += 30;
    else if (capitalUSD >= 100_000) score += 22;
    else if (capitalUSD >=  75_000) score += 14;
    else if (capitalUSD >=  50_000) score +=  8;
    else                            score +=  2;
  } else {
    score += 10; // unknown — neutral, don't penalise
  }

  // ── Business ownership (15 pts) ──────────────────────────────────────────
  if (ownedBusiness(raw)) score += 15;

  // ── Booking urgency — days until appointment (25 pts) ───────────────────
  const slotStart  = booking?.slot_start  ? new Date(booking.slot_start)  : null;
  const bookedAt   = booking?.created_at  ? new Date(booking.created_at)  : null;
  if (slotStart && bookedAt) {
    const daysOut = (slotStart - bookedAt) / (1000 * 60 * 60 * 24);
    if      (daysOut <= 1)  score += 25;
    else if (daysOut <= 3)  score += 20;
    else if (daysOut <= 7)  score += 14;
    else if (daysOut <= 14) score +=  7;
    else                    score +=  2;
  } else {
    score += 10; // unknown — neutral
  }

  // ── Contact completeness (10 pts) ────────────────────────────────────────
  if (booking?.phone) score += 5;
  if (booking?.email) score += 3;
  if (booking?.last_name) score += 2;

  // ── Source bonus (10 pts) ────────────────────────────────────────────────
  // Facebook lead ad with attribution = warm intent signal
  if (booking?.fb_attribution || lead?.source === 'Facebook Lead Ad') score += 10;

  return Math.min(100, Math.max(0, Math.round(score)));
}

// ─── Show Probability (0–100) ─────────────────────────────────────────────────
/**
 * Signals:
 *   Day of week                  — base rate
 *   Time of day                  — ±15 pts
 *   Days until appointment       — ±15 pts
 *   Investment level             — ±8 pts
 *   Business ownership           — +5 pts
 */
export function computeShowProbability(booking, lead = null) {
  const slotStart = booking?.slot_start ? new Date(booking.slot_start) : null;
  if (!slotStart) return 55; // no data — return neutral estimate

  const raw = lead?.raw_fields ?? null;

  // ── Day of week base ─────────────────────────────────────────────────────
  const dow = slotStart.getDay(); // 0=Sun … 6=Sat
  const DOW_BASE = [35, 68, 72, 70, 68, 55, 38];
  let prob = DOW_BASE[dow];

  // ── Time of day ──────────────────────────────────────────────────────────
  const h = slotStart.getHours();
  if      (h >= 9  && h < 11) prob += 12;
  else if (h >= 11 && h < 13) prob +=  8;
  else if (h >= 13 && h < 15) prob +=  5;
  else if (h >= 17)           prob -= 10;

  // ── Days until appointment ───────────────────────────────────────────────
  const bookedAt = booking?.created_at ? new Date(booking.created_at) : null;
  if (bookedAt) {
    const daysOut = (slotStart - bookedAt) / (1000 * 60 * 60 * 24);
    if      (daysOut <= 1)  prob +=  8;
    else if (daysOut <= 3)  prob +=  5;
    else if (daysOut <= 7)  prob +=  0;
    else if (daysOut <= 14) prob -=  5;
    else                    prob -= 15;
  }

  // ── Investment level ──────────────────────────────────────────────────────
  const capitalUSD =
    parseInvestmentUSD(getField(raw, 'liquid_capital', 'liquid capital')) ??
    parseInvestmentUSD(booking?.investment_level);

  if (capitalUSD != null) {
    if      (capitalUSD >= 250_000) prob += 8;
    else if (capitalUSD >= 150_000) prob += 5;
    else if (capitalUSD >= 100_000) prob += 2;
  }

  // ── Business ownership ────────────────────────────────────────────────────
  if (ownedBusiness(raw)) prob += 5;

  return Math.min(95, Math.max(10, Math.round(prob)));
}

// ─── Health Badge ─────────────────────────────────────────────────────────────
/**
 * Returns the meeting health badge based on both scores.
 * @returns {{ emoji: string, label: string, color: string, bg: string }}
 */
export function getHealthBadge(leadScore, showProbability) {
  if (leadScore >= 70 && showProbability >= 70) {
    return { emoji: '🟢', label: 'High',   color: '#1A7E24', bg: '#E3F4E5' };
  }
  if (leadScore >= 45 || showProbability >= 55) {
    return { emoji: '🟡', label: 'Medium', color: '#856404', bg: '#FFF9E6' };
  }
  return   { emoji: '🔴', label: 'Low',    color: '#C23934', bg: '#FDECEA' };
}

// ─── Score label helpers ──────────────────────────────────────────────────────

export function scoreColor(score) {
  if (score >= 75) return '#1A7E24';
  if (score >= 50) return '#856404';
  return '#C23934';
}

export function scoreBg(score) {
  if (score >= 75) return '#E3F4E5';
  if (score >= 50) return '#FFF9E6';
  return '#FDECEA';
}
