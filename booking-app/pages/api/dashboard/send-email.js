import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { lookupGHLContactByEmail } from '@/lib/ghl';

/**
 * POST /api/dashboard/send-email
 *
 * Sends an email to a contact via GHL conversations.
 * Falls back to returning a mailto: URL if GHL is not configured or fails.
 *
 * Body: { to_email, subject, body }
 * Returns: { ok, fallback?, mailto? }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { to_email, subject, body } = req.body;
  if (!to_email || !subject || !body) {
    return res.status(400).json({ error: 'to_email, subject, body required' });
  }

  const mailtoUrl = `mailto:${to_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const apiKey = process.env.GHL_API_KEY;

  if (!apiKey) {
    return res.json({ ok: true, fallback: true, mailto: mailtoUrl });
  }

  try {
    // Look up GHL contact
    const contact = await lookupGHLContactByEmail(to_email);
    if (!contact?.id) {
      return res.json({ ok: false, fallback: true, mailto: mailtoUrl, error: 'No GHL contact found' });
    }

    // Search for existing conversation
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/conversations/search?contactId=${contact.id}&limit=1`,
      { headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-04-15' } }
    );
    const searchData = await searchRes.json();
    let conversationId = searchData.conversations?.[0]?.id;

    // Create conversation if none exists
    if (!conversationId) {
      const createRes = await fetch('https://services.leadconnectorhq.com/conversations/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-04-15', 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id }),
      });
      const createData = await createRes.json();
      conversationId = createData.id || createData.conversation?.id;
    }

    if (!conversationId) {
      return res.json({ ok: false, fallback: true, mailto: mailtoUrl, error: 'Could not get conversation' });
    }

    // Send email via GHL
    const msgRes = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-04-15', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'Email',
        conversationId,
        subject,
        html: body.replace(/\n/g, '<br>'),
        emailFrom: session.user.email,
      }),
    });

    if (msgRes.ok) {
      return res.json({ ok: true });
    }

    const errData = await msgRes.json().catch(() => ({}));
    return res.json({ ok: false, fallback: true, mailto: mailtoUrl, error: errData.message || 'GHL send failed' });

  } catch (err) {
    return res.json({ ok: false, fallback: true, mailto: mailtoUrl, error: err.message });
  }
}
