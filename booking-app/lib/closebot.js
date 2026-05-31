/**
 * CloseBot API client — attribution only
 *
 * Auth: X-CB-KEY header
 * Base URL: https://api.closebot.com
 *
 * How CloseBot works:
 *   1. A lead comes in → GHL workflow sends an initial message/question
 *   2. When the lead responds, GHL activates CloseBot (if the right tag is present)
 *   3. CloseBot nurtures the lead and books directly to the GHL calendar you configure
 *   4. CloseBot bookings do NOT come through our /api/book endpoint
 *
 * Our role: attribution only.
 * If someone ends up booking through our page, we can check whether
 * CloseBot previously engaged them and attribute accordingly.
 *
 * Required env vars:
 *   CLOSEBOT_API_KEY  — your CloseBot API key
 */

const CB_BASE = 'https://api.closebot.com';

function cbHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-CB-KEY': process.env.CLOSEBOT_API_KEY || '',
  };
}

/**
 * Search CloseBot leads by text (phone number or name).
 * Returns first match or null.
 *
 * @param {string} search  - Phone or name string
 * @returns {Promise<Object|null>} LeadDto or null
 */
export async function findCloseBotLead(search) {
  if (!process.env.CLOSEBOT_API_KEY || !search) return null;

  try {
    const res = await fetch(`${CB_BASE}/lead/search`, {
      method: 'POST',
      headers: cbHeaders(),
      body: JSON.stringify({ search, count: 1 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // API returns an array of LeadDto
    const leads = Array.isArray(data) ? data : (data.leads ?? data.data ?? []);
    return leads[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Get bot actions for a given CloseBot leadId.
 * Checks whether the bot actually engaged (sent messages to) this lead.
 *
 * @param {string} leadId    - CloseBot internal lead ID
 * @param {number} maxCount  - Max actions to fetch (default 10)
 * @returns {Promise<Array>} Array of BotMetricAction objects
 */
export async function getCloseBotActions(leadId, maxCount = 10) {
  if (!process.env.CLOSEBOT_API_KEY || !leadId) return [];

  try {
    const params = new URLSearchParams({
      leadId,
      maxCount: String(maxCount),
      // Look back up to 30 days
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const res = await fetch(`${CB_BASE}/botMetric/actions?${params}`, {
      headers: cbHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.actions ?? data.data ?? []);
  } catch {
    return [];
  }
}

/**
 * Check whether CloseBot previously engaged a lead.
 * Used at booking time: if someone books through our page but CloseBot
 * had already engaged them, attribute the booking to CloseBot.
 *
 * @param {string} phone  - Lead phone number (preferred search term)
 * @param {string} name   - Lead name (fallback)
 * @returns {Promise<boolean>}
 */
export async function wasEngagedByCloseBot(phone, name) {
  if (!process.env.CLOSEBOT_API_KEY) return false;

  const searchTerm = phone || name;
  if (!searchTerm) return false;

  const lead = await findCloseBotLead(searchTerm);
  if (!lead) return false;

  const actions = await getCloseBotActions(lead.id, 1);
  return actions.length > 0;
}
