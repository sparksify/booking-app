export const config = { maxDuration: 60 };

import { getSupabaseAdmin } from '@/lib/supabase';

// Cross-run dedup for the metro sweep.
//
// Given a batch of prospects, returns the set of keys that already exist in
// pipeline_prospects from earlier runs — so the same owner/email isn't loaded
// into Smartlead twice from two different suburb scans. Matches on:
//   - email (exact, case-insensitive)
//   - owner_name + domain (same person running a business on the same domain)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prospects } = req.body || {};
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return res.status(200).json({ duplicate_emails: [], duplicate_owner_keys: [] });
  }

  const supabase = getSupabaseAdmin();

  const emails = [...new Set(
    prospects.map(p => (p.email || '').trim().toLowerCase()).filter(Boolean)
  )];

  const ownerKeys = [...new Set(
    prospects
      .map(p => {
        const owner = (p.owner_name || p.email_owner || '').trim().toLowerCase();
        const domain = (p.domain || '').trim().toLowerCase();
        return owner && domain ? `${owner}|${domain}` : null;
      })
      .filter(Boolean)
  )];

  try {
    const dupEmails = new Set();
    const dupOwnerKeys = new Set();

    if (emails.length) {
      const { data } = await supabase
        .from('pipeline_prospects')
        .select('email')
        .in('email', emails);
      (data || []).forEach(r => { if (r.email) dupEmails.add(String(r.email).trim().toLowerCase()); });
    }

    // Owner+domain match: pull existing rows for the candidate domains, then
    // compare owner names client-side (avoids a composite IN query).
    const domains = [...new Set(
      prospects.map(p => (p.domain || '').trim().toLowerCase()).filter(Boolean)
    )];
    if (domains.length) {
      const { data } = await supabase
        .from('pipeline_prospects')
        .select('owner_name, domain')
        .in('domain', domains);
      const existing = new Set(
        (data || [])
          .map(r => {
            const o = (r.owner_name || '').trim().toLowerCase();
            const d = (r.domain || '').trim().toLowerCase();
            return o && d ? `${o}|${d}` : null;
          })
          .filter(Boolean)
      );
      ownerKeys.forEach(k => { if (existing.has(k)) dupOwnerKeys.add(k); });
    }

    return res.status(200).json({
      duplicate_emails: [...dupEmails],
      duplicate_owner_keys: [...dupOwnerKeys],
    });
  } catch (err) {
    // Fail open — dedup is an optimization, not a correctness gate.
    console.error('dedup-check error:', err.message);
    return res.status(200).json({ duplicate_emails: [], duplicate_owner_keys: [], error: err.message });
  }
}
