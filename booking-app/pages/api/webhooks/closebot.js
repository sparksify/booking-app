/**
 * /api/webhooks/closebot  —  NOT IN USE
 *
 * CloseBot does NOT push outbound webhooks to us.
 * We call CloseBot's API; see lib/closebot.js.
 *
 * Integration points:
 *   - pages/api/webhooks/facebook.js          → triggers sequence on lead arrival
 *   - pages/api/book.js                       → auto-detects CloseBot attribution
 *   - pages/api/dashboard/trigger-closebot.js → manual push from dashboard
 */

export default function handler(req, res) {
  res.status(404).json({ error: 'Not in use. See lib/closebot.js.' });
}
