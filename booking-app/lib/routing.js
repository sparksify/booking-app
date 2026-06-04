/**
 * lib/routing.js
 *
 * Weighted round-robin lead routing engine.
 *
 * Given a brand and a lead's liquid capital value (raw string from Facebook),
 * determines which rep should receive the booking and increments the persistent
 * counter so the weighting is maintained across server restarts.
 *
 * Liquid capital tiers (matching the Facebook form options):
 *   t25_50    → $25,000 – $50,000
 *   t50_75    → $50,000 – $75,000
 *   t75_150   → $75,000 – $150,000
 *   t150_500  → $150,000 – $500,000
 *   t500_plus → $500,000+
 *   t_null    → No data / could not parse
 *
 * routing_rules shape per tier (stored in brands.routing_rules JSONB):
 *   [{ email: "steve@...", weight: 5 }, { email: "john@...", weight: 1 }]
 *   OR the string "round_robin" (use brand's rep_emails list, equal weight)
 *
 * The counter (brands.routing_counters) is a simple integer per tier that
 * increments on every call. The rep is determined by (counter % totalWeight),
 * giving exact proportional distribution over time.
 */

// ─── Tier mapping ─────────────────────────────────────────────────────────────

const TIER_ORDER = ['t25_50', 't50_75', 't75_150', 't150_500', 't500_plus'];

const TIER_LABELS = {
  t25_50:    '$25,000 – $50,000',
  t50_75:    '$50,000 – $75,000',
  t75_150:   '$75,000 – $150,000',
  t150_500:  '$150,000 – $500,000',
  t500_plus: '$500,000+',
  t_null:    'No data',
};

export { TIER_ORDER, TIER_LABELS };

/**
 * Map a raw liquid capital string (from Facebook form or GHL) → tier key.
 *
 * Handles formats like:
 *   "$25,000 – $50,000", "25000-50000", "500000+", "$500k+", "150k_500k"
 */
export function getTierKey(raw) {
  if (!raw) return 't_null';

  const s = String(raw).toLowerCase().replace(/[$,\s]/g, '');

  // Extract the first number in the string
  const nums = s.match(/\d+/g);
  if (!nums || nums.length === 0) return 't_null';

  // Check for "500k+" / "500000+" pattern first
  if (/500[k+]|500000\+/.test(s) || (nums[0] && parseInt(nums[0]) >= 500)) {
    // Disambiguate: if lower bound is >= 500 OR explicit "500+" marker
    const first = parseInt(nums[0]);
    if (first >= 500 || s.includes('+')) {
      // Could be $500,000+ or $500k
      const val = first < 1000 ? first * 1000 : first;
      if (val >= 500000) return 't500_plus';
    }
  }

  // General case: parse first number, normalize to dollars
  const firstNum = parseInt(nums[0]);
  const value = firstNum < 1000 ? firstNum * 1000 : firstNum; // handle "k" values

  if (value >= 500000) return 't500_plus';
  if (value >= 150000) return 't150_500';
  if (value >= 75000)  return 't75_150';
  if (value >= 50000)  return 't50_75';
  if (value >= 25000)  return 't25_50';

  return 't_null';
}

/**
 * Determine the next rep to assign for a brand+tier using weighted round-robin.
 *
 * 1. Reads routing_rules[tierKey] from the brand.
 * 2. Calculates which rep wins based on the current counter.
 * 3. Atomically increments the counter in Supabase.
 * 4. Returns the winning rep's email (or null if no reps configured).
 *
 * Does NOT check calendar availability — caller must do that and may need to
 * call this again with skipEmail to skip a rep whose calendar is full.
 *
 * @param {object} brand       — full brand row from Supabase
 * @param {string} tierKey     — e.g. 't500_plus'
 * @param {object} supabase    — Supabase admin client
 * @param {string} [skipEmail] — if set, skip this rep (calendar full), try next
 * @returns {Promise<string|null>}
 */
export async function getNextRep(brand, tierKey, supabase, skipEmail = null) {
  const rules = brand.routing_rules?.[tierKey];

  // Build the eligible rep list
  let repList = [];

  if (!rules || rules === 'round_robin') {
    // Equal weight round-robin across all brand reps
    repList = (brand.rep_emails || []).map(email => ({ email, weight: 1 }));
  } else if (Array.isArray(rules)) {
    repList = rules.filter(r => r.weight > 0);
  }

  if (repList.length === 0) {
    // Fall back to all brand reps with equal weight
    repList = (brand.rep_emails || []).map(email => ({ email, weight: 1 }));
  }
  if (repList.length === 0) return null;

  // Remove the skipped rep if provided (their calendar is full)
  const eligible = skipEmail ? repList.filter(r => r.email !== skipEmail) : repList;
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return eligible[0].email;

  // Get current counter for this tier
  const counters = brand.routing_counters || {};
  const counter  = typeof counters[tierKey] === 'number' ? counters[tierKey] : 0;
  const position = counter % totalWeight;

  // Walk through the rep list to find who owns this position
  let cumulative = 0;
  let winner = eligible[0].email;
  for (const rep of eligible) {
    cumulative += rep.weight;
    if (position < cumulative) {
      winner = rep.email;
      break;
    }
  }

  // Increment the counter (non-blocking — don't await in the critical path)
  const newCounters = { ...counters, [tierKey]: counter + 1 };
  supabase
    .from('brands')
    .update({ routing_counters: newCounters, updated_at: new Date().toISOString() })
    .eq('id', brand.id)
    .then(() => {})
    .catch(err => console.error('[routing] counter update failed:', err.message));

  return winner;
}

/**
 * Look up a brand by Facebook form ID.
 * Returns the brand row or null if no brand claims that form ID.
 *
 * @param {string} formId
 * @param {object} supabase
 */
export async function getBrandByFormId(formId, supabase) {
  if (!formId) return null;
  const { data } = await supabase
    .from('brands')
    .select('*')
    .contains('fb_form_ids', [formId])
    .eq('active', true)
    .maybeSingle();
  return data || null;
}

/**
 * Look up a brand by slug.
 *
 * @param {string} slug
 * @param {object} supabase
 */
export async function getBrandBySlug(slug, supabase) {
  if (!slug) return null;
  const { data } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  return data || null;
}
