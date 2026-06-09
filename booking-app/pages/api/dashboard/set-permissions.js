/**
 * POST /api/dashboard/set-permissions   (admin only)
 * Body: { email, permissions: { [key]: boolean } }
 *
 * Saves a member's granular capability overrides. Only known permission keys
 * are persisted. Admins always have every permission regardless of this object.
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getPermissions } from '@/lib/role';
import { ALL_PERMISSION_KEYS } from '@/lib/permissions';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const myPerms = await getPermissions(session.user?.email);
  if (!myPerms.settings_permissions) return res.status(403).json({ error: 'Not allowed' });

  const { email, permissions } = req.body || {};
  if (!email || typeof permissions !== 'object' || permissions === null) {
    return res.status(400).json({ error: 'email and permissions object required' });
  }

  // Whitelist to known keys + booleans only
  const clean = {};
  for (const k of ALL_PERMISSION_KEYS) {
    if (typeof permissions[k] === 'boolean') clean[k] = permissions[k];
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('team_members')
    .update({ permissions: clean })
    .ilike('email', email);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, email, permissions: clean });
}
