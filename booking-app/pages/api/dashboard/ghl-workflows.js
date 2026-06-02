import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

// Known consultant user IDs — add more as needed
const KNOWN_USER_IDS = [
  'ZJTH1bHHkmeBf5uOcziW', // Steve Sparks
  'kzKxqpO9YJXGCbBj9k02', // John Doty
];

/**
 * GET /api/dashboard/ghl-workflows
 *
 * Returns GHL workflows and consultants for the Settings Workflow Automations section.
 *
 * Response:
 * {
 *   workflows: [{ id, name }],
 *   users:     [{ id, name }],
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return res.json({ workflows: [], users: [] });

  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Version': GHL_VERSION };

  // Fetch workflows + user names in parallel
  const [wfRes, ...userResults] = await Promise.allSettled([
    fetch(`${GHL_API}/workflows/?locationId=${locationId}`, { headers })
      .then(r => r.ok ? r.json() : null),
    ...KNOWN_USER_IDS.map(uid =>
      fetch(`${GHL_API}/users/${uid}`, { headers })
        .then(r => r.ok ? r.json() : null)
    ),
  ]);

  // Parse workflows
  const wfData  = wfRes.status === 'fulfilled' ? wfRes.value : null;
  const rawWFs  = wfData?.workflows || [];
  const workflows = rawWFs
    .filter(w => w.status === 'published' || !w.status) // include published or if no status field
    .map(w => ({ id: w.id, name: w.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Parse users
  const users = userResults.map((result, i) => {
    const uid = KNOWN_USER_IDS[i];
    if (result.status !== 'fulfilled' || !result.value) return { id: uid, name: uid };
    const d = result.value;
    const u = d.user || d;
    const name = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || uid;
    return { id: uid, name };
  });

  res.json({ workflows, users });
}
