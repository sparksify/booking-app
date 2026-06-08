/**
 * POST /api/dashboard/set-role   (admin only)
 * Body: { email, role }   role ∈ 'admin' | 'member'
 *
 * Updates a team member's role. Guards against an admin removing their own
 * admin access (so there's always at least one way back in).
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getRole } from '@/lib/role';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const myEmail = session.user?.email;
  const role = await getRole(myEmail);
  if (role !== 'admin') return res.status(403).json({ error: 'Admins only' });

  const { email, role: newRole } = req.body || {};
  if (!email || !['admin', 'member'].includes(newRole)) {
    return res.status(400).json({ error: 'email and role (admin|member) required' });
  }
  if (email.toLowerCase() === (myEmail || '').toLowerCase() && newRole !== 'admin') {
    return res.status(400).json({ error: "You can't remove your own admin access" });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('team_members')
    .update({ role: newRole })
    .ilike('email', email);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, email, role: newRole });
}
