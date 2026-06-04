/**
 * GET /api/dashboard/test-bb
 * Pings the BlueBubbles server to verify credentials.
 * Used by the Settings page "Test Connection" button.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { ping, invalidateBBCache } from '@/lib/bluebubbles';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  // Force fresh credential load after settings save
  invalidateBBCache();

  try {
    const result = await ping();
    return res.json(result);
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
}
