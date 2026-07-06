/**
 * POST /api/sync-granola
 *
 * Polls Granola for new/updated notes since last sync, runs Claude extraction,
 * writes results to Supabase (leads + call_logs) and GHL.
 *
 * Called by Vercel Cron every 2 minutes (see vercel.json).
 * Authenticated via CRON_SECRET env var.
 *
 * Required env vars:
 *   GRANOLA_API_KEY           — Granola Settings → Connectors → API keys
 *   ANTHROPIC_API_KEY         — Anthropic console
 *   NEXT_PUBLIC_SUPABASE_URL  — already set
 *   SUPABASE_SERVICE_ROLE_KEY — already set
 *   GHL_API_KEY               — already set
 *   GHL_LOCATION_ID           — already set
 *   CRON_SECRET               — random secret, add to Vercel env vars
 */

import { getSupabaseAdmin } from '@/lib/supabase';

const GRANOLA_BASE = 'https://public-api.granola.ai';
const GHL_BASE     = 'https://services.leadconnectorhq.com';
const GHL_VERSION  = '2021-07-28';

// ─── Granola ──────────────────────────────────────────────────────────────────

async function granolaFetch(path, params = {}) {
  const url = new URL(`${GRANOLA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.GRANOLA_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Granola ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function listNewNotes(updatedAfter) {
  const notes = [];
  let cursor = null;
  do {
    const params = { updated_after: updatedAfter, page_size: '30' };
    if (cursor) params.cursor = cursor;
    const data = await granolaFetch('/v1/notes', params);
    notes.push(...data.notes);
    cursor = data.hasMore ? data.cursor : null;
  } while (cursor);
  return notes;
}

async function getFullNote(noteId) {
  return granolaFetch(`/v1/notes/${noteId}`, { include: 'transcript' });
}

// ─── Transcript ───────────────────────────────────────────────────────────────

function formatTranscript(items) {
  return items
    .map((item) => {
      // macOS: microphone = Steve, speaker = prospect
      // iOS: both microphone, diarization_label = Speaker A/B
      const label =
        item.speaker.diarization_label ??
        (item.speaker.source === 'microphone' ? 'Steve' : 'Prospect');
      return `${label}: ${item.text}`;
    })
    .join('\n');
}

// ─── Claude extraction ────────────────────────────────────────────────────────

async function extractCallData(note, transcriptText) {
  const prompt = `You are analyzing a sales call transcript. Extract structured data and return ONLY valid JSON — no markdown, no explanation, no code fences.

Note title: ${note.title ?? 'Untitled'}
Summary: ${note.summary_text}

Transcript:
${transcriptText || '(no transcript available)'}

Return this exact JSON structure:
{
  "prospect_name": "full name or empty string",
  "sentiment": "positive" or "neutral" or "negative",
  "interest_level": integer 1-10,
  "topics_discussed": ["topic1"],
  "objections": ["objection1"],
  "action_items_steve": ["what Steve needs to do"],
  "action_items_prospect": ["what prospect needs to do"],
  "recommended_brands": ["brand names mentioned as fits"],
  "next_step": "one sentence describing the agreed next step",
  "follow_up_date": "YYYY-MM-DD or null",
  "disqualifiers": ["any reasons this prospect is not a fit"]
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data)}`);
    }
    const text = data.content?.[0]?.text ?? '';
    const cleaned = text.replace(/^```json?\s*/m, '').replace(/\s*```$/m, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    // Re-throw so the caller logs it in the errors array
    throw new Error(`Claude extraction: ${err.message}`);
  }
}

// ─── Contact matching ─────────────────────────────────────────────────────────

async function findLeadByEmail(supabase, email) {
  const { data } = await supabase
    .from('leads')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  return data?.id ?? null;
}

async function findLeadByPhone(supabase, phone) {
  const digits  = phone.replace(/\D/g, '');
  const last10  = digits.slice(-10);
  if (last10.length < 7) return null;

  // Build all common format variants for the query
  const variants = [
    phone,
    digits,
    last10,
    `+1${last10}`,
    `1${last10}`,
    `(${last10.slice(0,3)}) ${last10.slice(3,6)}-${last10.slice(6)}`,
    `${last10.slice(0,3)}-${last10.slice(3,6)}-${last10.slice(6)}`,
    `${last10.slice(0,3)}.${last10.slice(3,6)}.${last10.slice(6)}`,
  ];

  const { data } = await supabase
    .from('leads')
    .select('id')
    .in('phone', variants)
    .limit(1);
  return data?.[0]?.id ?? null;
}

// Extract phone number from Granola phone call titles like "Phone call with +19723479713"
function extractPhoneFromTitle(title) {
  if (!title) return null;
  const match = title.match(/(\+?1?\d{10,15})/);
  return match ? match[1] : null;
}

async function findGhlContactByEmail(email) {
  const res = await fetch(
    `${GHL_BASE}/contacts/?locationId=${process.env.GHL_LOCATION_ID}&query=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: GHL_VERSION } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.contacts?.[0]?.id ?? null;
}

async function findGhlContactByPhone(phone) {
  // Normalize to E.164 for the query
  const digits = phone.replace(/\D/g, '');
  const e164   = `+${digits.length === 10 ? '1' + digits : digits}`;
  const res = await fetch(
    `${GHL_BASE}/contacts/?locationId=${process.env.GHL_LOCATION_ID}&query=${encodeURIComponent(e164)}`,
    { headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: GHL_VERSION } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.contacts?.[0]?.id ?? null;
}

// ─── GHL write ────────────────────────────────────────────────────────────────

async function writeToGhl(ghlContactId, note, extraction) {
  const noteBody = [
    `📞 Call Note — ${note.title ?? new Date(note.created_at).toLocaleDateString()}`,
    '',
    note.summary_text,
    '',
    `Next Step: ${extraction.next_step}`,
    `Follow Up: ${extraction.follow_up_date ?? 'TBD'}`,
    `Interest Level: ${extraction.interest_level}/10`,
    `Sentiment: ${extraction.sentiment}`,
    '',
    extraction.action_items_steve.length
      ? `Action Items (Steve):\n${extraction.action_items_steve.map(a => `• ${a}`).join('\n')}`
      : '',
    extraction.action_items_prospect.length
      ? `Action Items (Prospect):\n${extraction.action_items_prospect.map(a => `• ${a}`).join('\n')}`
      : '',
    `\nGranola: ${note.web_url}`,
  ].filter(Boolean).join('\n');

  // Add note to contact timeline
  await fetch(`${GHL_BASE}/contacts/${ghlContactId}/notes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      'Content-Type': 'application/json',
      Version: GHL_VERSION,
    },
    body: JSON.stringify({ body: noteBody }),
  });

  // Update custom fields
  // TODO: Replace field id values with your actual GHL custom field keys
  // GHL → Settings → Custom Fields → copy the "Field Key" for each
  await fetch(`${GHL_BASE}/contacts/${ghlContactId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      'Content-Type': 'application/json',
      Version: GHL_VERSION,
    },
    body: JSON.stringify({
      customFields: [
        { id: 'call_summary',   field_value: note.summary_text },
        { id: 'last_called_at', field_value: note.created_at },
        { id: 'interest_level', field_value: String(extraction.interest_level) },
        { id: 'next_step',      field_value: extraction.next_step },
        { id: 'follow_up_date', field_value: extraction.follow_up_date ?? '' },
      ],
    }),
  });
}

// ─── Supabase writes ──────────────────────────────────────────────────────────

async function writeToSupabase(supabase, leadId, note, transcriptText, extraction) {
  const callLog = {
    lead_id:              leadId,
    granola_note_id:      note.id,
    granola_note_url:     note.web_url,
    note_title:           note.title,
    call_started_at:      note.calendar_event?.scheduled_start_time ?? note.created_at,
    call_ended_at:        note.calendar_event?.scheduled_end_time ?? null,
    summary:              note.summary_text,
    summary_md:           note.summary_markdown,
    transcript:           transcriptText,
    ...(extraction ?? {}),
    synced_to_ghl:        false,
  };

  await supabase.from('call_logs').upsert(callLog, { onConflict: 'granola_note_id' });

  if (leadId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('call_count')
      .eq('id', leadId)
      .single();

    await supabase.from('leads').update({
      last_called_at:    note.created_at,
      call_summary:      note.summary_text,
      call_summary_md:   note.summary_markdown,
      call_transcript:   transcriptText,
      call_action_items: extraction?.action_items_steve ?? [],
      call_count:        (lead?.call_count ?? 0) + 1,
      granola_note_id:   note.id,
      granola_note_url:  note.web_url,
    }).eq('id', leadId);
  }
}

async function writeUnmatched(supabase, note, emails) {
  await supabase.from('unmatched_calls').upsert(
    {
      granola_note_id:  note.id,
      granola_note_url: note.web_url,
      note_title:       note.title,
      attendee_emails:  emails,
      summary:          note.summary_text,
      raw_note:         note,
    },
    { onConflict: 'granola_note_id' }
  );
}

// ─── Sync state ───────────────────────────────────────────────────────────────

async function getLastSyncAt(supabase) {
  const { data } = await supabase
    .from('sync_state')
    .select('value')
    .eq('key', 'granola_last_sync_at')
    .single();
  const raw = data?.value ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Normalize — Postgres TEXT may use space separator instead of T
  return new Date(raw).toISOString();
}

async function setLastSyncAt(supabase, ts) {
  await supabase.from('sync_state').upsert({
    key: 'granola_last_sync_at',
    value: ts,
    updated_at: new Date().toISOString(),
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();

  // Authenticate cron calls
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase  = getSupabaseAdmin();
  const syncStart = new Date().toISOString();

  try {
    const lastSyncAt = await getLastSyncAt(supabase);
    console.log(`[sync-granola] Polling notes updated after ${lastSyncAt}`);

    const notes = await listNewNotes(lastSyncAt);
    console.log(`[sync-granola] Found ${notes.length} notes`);

    if (notes.length === 0) {
      await setLastSyncAt(supabase, syncStart);
      return res.json({ synced: 0, unmatched: 0 });
    }

    let synced = 0, unmatched = 0;
    const errors = [];

    for (const summary of notes) {
      try {
        // Skip if already processed and unchanged
        const { data: existing } = await supabase
          .from('call_logs')
          .select('updated_at')
          .eq('granola_note_id', summary.id)
          .maybeSingle();

        if (existing && new Date(existing.updated_at) >= new Date(summary.updated_at)) {
          continue;
        }

        const note         = await getFullNote(summary.id);
        const transcriptText = note.transcript ? formatTranscript(note.transcript) : '';

        // Collect prospect emails (everyone except Steve)
        const emailSet = new Set();
        note.attendees.forEach(a => emailSet.add(a.email.toLowerCase()));
        note.calendar_event?.invitees.forEach(i => emailSet.add(i.email.toLowerCase()));
        emailSet.delete(note.owner.email.toLowerCase());
        const prospectEmails = [...emailSet];

        // Match to lead / GHL contact — try email first, then phone from title
        let leadId = null, ghlContactId = null;

        for (const email of prospectEmails) {
          leadId = await findLeadByEmail(supabase, email);
          if (leadId) break;
        }
        for (const email of prospectEmails) {
          ghlContactId = await findGhlContactByEmail(email);
          if (ghlContactId) break;
        }

        // Fallback: match by phone number extracted from title
        if (!leadId || !ghlContactId) {
          const phone = extractPhoneFromTitle(note.title);
          if (phone) {
            if (!leadId)      leadId      = await findLeadByPhone(supabase, phone);
            if (!ghlContactId) ghlContactId = await findGhlContactByPhone(phone);
          }
        }

        const extraction = await extractCallData(note, transcriptText);

        await writeToSupabase(supabase, leadId, note, transcriptText, extraction);

        if (ghlContactId && extraction) {
          await writeToGhl(ghlContactId, note, extraction);
          await supabase
            .from('call_logs')
            .update({ synced_to_ghl: true })
            .eq('granola_note_id', note.id);
        }

        if (!leadId && !ghlContactId) {
          await writeUnmatched(supabase, note, prospectEmails);
          unmatched++;
          console.log(`[sync-granola] Unmatched: "${note.title}" (${prospectEmails.join(', ')})`);
        } else {
          synced++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${summary.id}: ${msg}`);
        console.error(`[sync-granola] Error on ${summary.id}:`, err);
      }
    }

    await setLastSyncAt(supabase, syncStart);
    console.log(`[sync-granola] Done. synced=${synced} unmatched=${unmatched} errors=${errors.length}`);

    return res.json({ synced, unmatched, ...(errors.length ? { errors } : {}) });
  } catch (err) {
    console.error('[sync-granola] Fatal:', err);
    return res.status(500).json({ error: err.message ?? 'Unknown error' });
  }
}
