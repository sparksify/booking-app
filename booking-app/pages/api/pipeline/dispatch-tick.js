// Always-on backlog engine — DISPATCH tick.
// Driven by Vercel cron. Each run: pull a batch of backlog prospects (verified,
// not yet loaded), generate the 2-email sequence JIT via the existing outreach
// endpoint, and push into the Smartlead campaign using the proven lead-add call.
// Respects a daily send cap so it drips while the mailboxes are warming.
export const config = { maxDuration: 300 };

import { getSupabaseAdmin } from '@/lib/supabase';

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID;

const baseUrl = () =>
  process.env.ENGINE_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

function firstName(n) { return n ? n.trim().split(' ')[0] : 'there'; }
function lastName(n) { return n ? n.trim().split(' ').slice(1).join(' ') : ''; }

async function isDuplicate(email) {
  try {
    const r = await fetch(`https://server.smartlead.ai/api/v1/leads?api_key=${SMARTLEAD_API_KEY}&email=${encodeURIComponent(email)}`);
    const d = await r.json();
    return Array.isArray(d) && d.length > 0;
  } catch (e) { return false; }
}

async function addLead(p, seq) {
  const r = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SMARTLEAD_CAMPAIGN_ID}/leads?api_key=${SMARTLEAD_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_list: [{
          email: p.email,
          first_name: firstName(p.owner_name),
          last_name: lastName(p.owner_name),
          company_name: p.business_name,
          custom_fields: {
            email1_subject: seq.email1_subject, email1_body: seq.email1_body,
            email2_subject: seq.email2_subject, email2_body: seq.email2_body,
          },
        }],
      }),
    }
  );
  return r.ok;
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supa = getSupabaseAdmin();
  const { data: eng } = await supa.from('pipeline_engine').select('*').eq('id', 1).single();
  if (!eng || !eng.enabled) return res.status(200).json({ skipped: 'engine_disabled' });
  if (!SMARTLEAD_API_KEY || !SMARTLEAD_CAMPAIGN_ID) {
    return res.status(200).json({ skipped: 'missing_smartlead_config' });
  }

  // Daily send cap (dispatched today, UTC).
  const today = new Date().toISOString().slice(0, 10);
  const { count: sentToday } = await supa.from('pipeline_prospects')
    .select('*', { count: 'exact', head: true })
    .eq('smartlead_status', 'loaded').gte('dispatched_at', `${today}T00:00:00Z`);
  const remaining = Math.max(0, (eng.send_per_day || 300) - (sentToday || 0));
  if (remaining <= 0) return res.status(200).json({ skipped: 'daily_cap_reached', sentToday });

  const batchSize = Math.min(remaining, eng.dispatch_batch || 25);
  const { data: backlog } = await supa.from('pipeline_prospects')
    .select('*').eq('loaded', false).eq('loadable', true).not('email', 'is', null)
    .order('created_at').limit(batchSize);
  if (!backlog?.length) return res.status(200).json({ skipped: 'backlog_empty' });

  // Generate sequences JIT (consultative). Reuses the existing outreach endpoint.
  let variants = [];
  try {
    const r = await fetch(`${baseUrl()}/api/pipeline/outreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businesses: backlog.map(b => ({ ...b, loadable: true, email_owner: b.owner_name })),
        variants: [{ label: 'consultative', style: 'consultative' }],
      }),
    });
    variants = (await r.json()).results || [];
  } catch (e) {
    return res.status(200).json({ error: 'outreach_failed: ' + e.message });
  }

  let loaded = 0, skipped = 0, failed = 0;
  for (const p of backlog) {
    const v = variants.find(x => x.email && x.email.toLowerCase() === String(p.email).toLowerCase());
    const seq = v?.outreach_variants?.[0];
    if (!seq) {
      failed++;
      await supa.from('pipeline_prospects')
        .update({ dispatch_attempts: (p.dispatch_attempts || 0) + 1, smartlead_status: 'failed_sequence' }).eq('id', p.id);
      continue;
    }
    if (await isDuplicate(p.email)) {
      skipped++;
      await supa.from('pipeline_prospects')
        .update({ loaded: true, dispatched_at: new Date().toISOString(), smartlead_status: 'skipped_duplicate' }).eq('id', p.id);
      continue;
    }
    const ok = await addLead(p, seq);
    if (ok) {
      loaded++;
      await supa.from('pipeline_prospects')
        .update({ loaded: true, dispatched_at: new Date().toISOString(), smartlead_status: 'loaded' }).eq('id', p.id);
    } else {
      failed++;
      await supa.from('pipeline_prospects')
        .update({ dispatch_attempts: (p.dispatch_attempts || 0) + 1, smartlead_status: 'failed_smartlead' }).eq('id', p.id);
    }
  }

  return res.status(200).json({ batch: backlog.length, loaded, skipped, failed, sentToday: (sentToday || 0) + loaded, cap: eng.send_per_day || 300 });
}
