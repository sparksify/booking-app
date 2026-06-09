/**
 * GET /api/dashboard/team-members
 *
 * Returns the list of active reps for pickers (e.g. appointment transfer).
 * Each rep: { email, name, has_calendar } where has_calendar indicates a
 * connected Google Calendar (required to receive transferred appointments).
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('team_members')
    .select('email, name, google_refresh_token')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const reps = (data || []).map(m => ({
    email:        m.email,
    name:         m.name,
    has_calendar: !!m.google_refresh_token,
  }));

  return res.json({ reps, me: session.user?.email || null });
}
