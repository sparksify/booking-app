import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET  /api/dashboard/settings  → returns current settings row
 * POST /api/dashboard/settings  → updates settings row
 *
 * Both require an active dashboard session.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('settings').select('*').eq('id', 1).single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const {
      work_start, work_end, timezone,
      meeting_duration, meeting_title,
      days_ahead, buffer_minutes,
    } = req.body;

    const { data, error } = await supabase
      .from('settings')
      .update({
        work_start:       work_start       ?? undefined,
        work_end:         work_end         ?? undefined,
        timezone:         timezone         ?? undefined,
        meeting_duration: meeting_duration ?? undefined,
        meeting_title:    meeting_title    ?? undefined,
        days_ahead:       days_ahead       ?? undefined,
        buffer_minutes:   buffer_minutes   ?? undefined,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', 1)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    // Toggle a team member's active status
    const { email, active } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const { error } = await supabase
      .from('team_members')
      .update({ active: !!active })
      .eq('email', email);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
