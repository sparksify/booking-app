import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getPermissions } from '@/lib/role';
import { checkGreenTeamExpress } from '@/lib/greenTeamExpressServer.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) return res.status(401).json({ error: 'Unauthorized' });
  const perms = await getPermissions(session.user.email);
  if (!perms.page_leads && !perms.page_meetings) return res.status(403).json({ error: 'Forbidden' });
  const origin = req.query.origin;
  if (typeof origin !== 'string' || origin.trim().length < 3 || origin.length > 200 || /[\x00-\x1F]/.test(origin)) {
    return res.status(400).json({ error: 'A resolved territory is required.' });
  }
  try {
    return res.json(await checkGreenTeamExpress(origin.trim()));
  } catch {
    return res.status(502).json({ status: 'unavailable', error: 'Driving routes could not be checked. Please try again.' });
  }
}
