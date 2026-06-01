import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { lookupGHLContactByEmail, addGHLTags, removeGHLTags } from '@/lib/ghl';

/**
 * GET  /api/dashboard/contact-tags?email=...
 *   → { contactId, tags: string[] }
 *
 * POST /api/dashboard/contact-tags
 *   body: { email, tags: string[] }
 *   → { contactId, tags: string[] }   (updated list)
 *
 * DELETE /api/dashboard/contact-tags
 *   body: { email, tags: string[] }
 *   → { contactId, tags: string[] }   (updated list)
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const email = req.method === 'GET' ? req.query.email : req.body?.email;
  if (!email) return res.status(400).json({ error: 'email required' });

  // Look up the GHL contact
  const contact = await lookupGHLContactByEmail(email).catch(() => null);
  if (!contact) return res.json({ contactId: null, tags: [] });

  if (req.method === 'GET') {
    return res.json({ contactId: contact.id, tags: contact.tags || [] });
  }

  if (req.method === 'POST') {
    const { tags } = req.body;
    if (!tags?.length) return res.status(400).json({ error: 'tags required' });
    await addGHLTags(contact.id, tags).catch(console.error);
    // Re-fetch to get the authoritative tag list
    const updated = await lookupGHLContactByEmail(email).catch(() => null);
    return res.json({ contactId: contact.id, tags: updated?.tags || [] });
  }

  if (req.method === 'DELETE') {
    const { tags } = req.body;
    if (!tags?.length) return res.status(400).json({ error: 'tags required' });
    await removeGHLTags(contact.id, tags).catch(console.error);
    const updated = await lookupGHLContactByEmail(email).catch(() => null);
    return res.json({ contactId: contact.id, tags: updated?.tags || [] });
  }

  return res.status(405).end();
}
