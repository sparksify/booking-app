import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { lookupGHLContactByEmail, addGHLTags } from '@/lib/ghl';

/**
 * POST /api/dashboard/bulk-tag
 * Body: { emails: string[], tags: string[] | string }
 *
 * Adds the given tag(s) to each contact in GHL (resolved by email). Used by the
 * Leads page to bulk-tag a selection so a GHL workflow can be fired off the tag.
 * Returns how many were tagged and which emails couldn't be resolved.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { emails, tags } = req.body || {};
  const tagList = (Array.isArray(tags) ? tags : [tags])
    .map(t => String(t || '').trim()).filter(Boolean);
  const emailList = [...new Set(
    (emails || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean)
  )];

  if (!tagList.length)   return res.status(400).json({ error: 'At least one tag is required.' });
  if (!emailList.length) return res.status(400).json({ error: 'No contacts with an email were selected.' });

  let tagged = 0;
  const failed = [];

  // Process in small batches to stay under GHL's rate limits.
  for (let i = 0; i < emailList.length; i += 5) {
    const batch = emailList.slice(i, i + 5);
    await Promise.all(batch.map(async (email) => {
      try {
        const contact = await lookupGHLContactByEmail(email);
        if (!contact?.id) { failed.push(email); return; }
        await addGHLTags(contact.id, tagList);
        tagged++;
      } catch {
        failed.push(email);
      }
    }));
  }

  return res.json({ ok: true, tagged, failed, total: emailList.length });
}
