# Granola → Kanso Sync: Handoff Document

## What's Built and Working

A fully automated pipeline that:
1. Polls Granola every 2 minutes via Vercel Cron
2. Fetches new call notes + transcripts
3. Runs Claude extraction to produce structured sales data
4. Writes to Supabase `call_logs` table
5. Posts a formatted note to the GHL contact timeline

**Status: End-to-end working and live in production.**

---

## Repo

GitHub: `https://github.com/sparksify/booking-app`  
Production URL: `https://www.trykanso.co`  
Vercel project: `booking-app` under `steves-projects-c6a4efb3`

---

## Files Added/Modified

### New file: `booking-app/pages/api/sync-granola.js`
The full sync route. Key functions:
- `listNewNotes(updatedAfter)` — polls `GET /v1/notes?updated_after=...` from Granola
- `getFullNote(noteId)` — fetches full note with transcript
- `extractCallData(note, transcriptText)` — calls Claude to extract structured JSON
- `findLeadByEmail / findLeadByPhone` — matches to Supabase `leads` table
- `findGhlContactByEmail / findGhlContactByPhone` — matches to GHL via `GET /contacts/?locationId=xxx&query=xxx`
- `writeToSupabase` — upserts to `call_logs`, updates `leads` if matched
- `writeToGhl` — posts note to contact timeline + updates custom fields
- `writeUnmatched` — queues unmatched notes for manual review

**Matching logic:**
- First tries email match (from Granola `attendees` + `calendar_event.invitees`)
- Falls back to phone extracted from note title (e.g. `"Phone call with +17048868866"`)
- Phone normalization: tries E.164, raw digits, last-10-digit format variants
- GHL search uses `/contacts/?locationId=xxx&query=xxx` (general query param, NOT separate phone/email params)

### Modified: `booking-app/vercel.json`
Added cron entry (`*/2 * * * *`) and `maxDuration: 60` for the sync route.

### New SQL (already run): Supabase migration
Added to the `leads` table:
- `last_called_at`, `call_summary`, `call_summary_md`, `call_transcript`
- `call_action_items` (JSONB), `call_count`, `granola_note_id`, `granola_note_url`

New tables created:
- `call_logs` — one row per Granola note, stores full extraction output
- `unmatched_calls` — notes that couldn't be matched to a lead or GHL contact
- `sync_state` — key/value store for `granola_last_sync_at` timestamp

---

## Environment Variables (all set in Vercel)

| Variable | Notes |
|---|---|
| `GRANOLA_API_KEY` | `grn_sXf5lTxBVgly...` — Granola personal API key |
| `CRON_SECRET` | Random secret — Vercel sends as Bearer token to authenticate cron calls |
| `GHL_API_KEY` | Already existed — GHL private integration key |
| `GHL_LOCATION_ID` | Already existed — GHL sub-account location ID |
| `ANTHROPIC_API_KEY` | Already existed — used by pipeline routes |
| `NEXT_PUBLIC_SUPABASE_URL` | Already existed |
| `SUPABASE_SERVICE_ROLE_KEY` | Already existed |

---

## Granola API

Base URL: `https://public-api.granola.ai`  
Auth: `Authorization: Bearer <GRANOLA_API_KEY>`

Key endpoints:
- `GET /v1/notes?updated_after=ISO8601&page_size=30` — list notes (paginated via `cursor`)
- `GET /v1/notes/{note_id}?include=transcript` — full note with transcript

Note object shape:
```json
{
  "id": "not_xxxx",
  "title": "Phone call with +17048868866",
  "owner": { "name": "Steve Sparks", "email": "steve@sparksify.com" },
  "created_at": "2026-07-06T13:00:00Z",
  "updated_at": "2026-07-06T13:05:00Z",
  "web_url": "https://notes.granola.ai/d/...",
  "calendar_event": { "invitees": [{"email": "..."}], ... },
  "attendees": [{ "name": "...", "email": "..." }],
  "summary_text": "Plain text summary",
  "summary_markdown": "## Summary...",
  "transcript": [
    { "speaker": { "source": "microphone" }, "text": "Steve's words..." },
    { "speaker": { "source": "speaker" }, "text": "Prospect's words..." }
  ]
}
```

On macOS: `speaker.source = "microphone"` = Steve, `"speaker"` = prospect.  
On iOS phone calls: both show `"microphone"` with `diarization_label = "Speaker A/B"`.

---

## Claude Extraction Output Schema

```json
{
  "prospect_name": "string",
  "sentiment": "positive|neutral|negative",
  "interest_level": 1-10,
  "topics_discussed": ["string"],
  "objections": ["string"],
  "action_items_steve": ["string"],
  "action_items_prospect": ["string"],
  "recommended_brands": ["string"],
  "next_step": "string",
  "follow_up_date": "YYYY-MM-DD or null",
  "disqualifiers": ["string"]
}
```

Model used: `claude-sonnet-4-6` (matches existing pipeline routes in the project).

---

## Supabase Schema: `call_logs` Table

```sql
id                    UUID PRIMARY KEY
lead_id               UUID REFERENCES leads(id)  -- null if no Supabase lead match
granola_note_id       TEXT UNIQUE
granola_note_url      TEXT
note_title            TEXT
call_started_at       TIMESTAMPTZ
call_ended_at         TIMESTAMPTZ
summary               TEXT
summary_md            TEXT
transcript            TEXT
prospect_name         TEXT
sentiment             TEXT
interest_level        INTEGER
topics_discussed      JSONB
objections            JSONB
action_items_steve    JSONB
action_items_prospect JSONB
recommended_brands    JSONB
next_step             TEXT
follow_up_date        DATE
disqualifiers         JSONB
synced_to_ghl         BOOLEAN
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ
```

**Important:** `lead_id` is null for contacts that are only in GHL (not in the Supabase `leads` table). The `leads` table only contains Facebook Lead Ad submissions. Many GHL contacts (added directly) will have `lead_id = null` in `call_logs` even when successfully synced to GHL.

---

## What Still Needs to Be Built

### UI Panel on Kanso Contact Card

The `call_logs` data exists in Supabase but there is no UI in Kanso showing it yet.

**Where to add it:**  
The prospects/contacts dashboard is at `booking-app/pages/dashboard/prospects.js`.  
Look at the existing contact card/detail components in `booking-app/components/` to understand the pattern.

**What the panel should show:**
- Call summary (from `call_logs.summary`)
- Interest badge (1–10 color-coded: 1–4 red, 5–7 yellow, 8–10 green)
- Sentiment badge (positive/neutral/negative)
- Action items for Steve (`call_logs.action_items_steve` JSONB array)
- Next step (`call_logs.next_step`)
- Follow-up date (`call_logs.follow_up_date`)
- Collapsible transcript (`call_logs.transcript`)
- Link to Granola note (`call_logs.granola_note_url`)
- Call count + last called date (from `leads.call_count`, `leads.last_called_at`)

**Data fetching:**  
Join `call_logs` to the contact by `granola_note_id` or `lead_id`. For GHL-only contacts (no `lead_id`), you'll need to fetch from `call_logs` by matching the GHL contact ID — currently `call_logs` doesn't store `ghl_contact_id`. Either:
- Add `ghl_contact_id` column to `call_logs` (recommended), or
- Fetch by phone number cross-referenced from the note title

**Recommended: add `ghl_contact_id` to `call_logs` first:**
```sql
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;
CREATE INDEX IF NOT EXISTS idx_call_logs_ghl_contact_id ON call_logs (ghl_contact_id);
```
And update `sync-granola.js` to write it in `writeToSupabase`.

---

## GHL Custom Fields (TODO)

The `writeToGhl` function currently uses placeholder field IDs:
```js
{ id: 'call_summary',   field_value: ... },
{ id: 'last_called_at', field_value: ... },
{ id: 'interest_level', field_value: ... },
{ id: 'next_step',      field_value: ... },
{ id: 'follow_up_date', field_value: ... },
```

These need to be replaced with real GHL custom field keys (GHL → Settings → Custom Fields → copy the "Field Key" for each). The timeline note IS working; only the custom field updates are broken.

---

## Known Issues / Edge Cases

1. **`lead_id` is null for direct GHL contacts** — the `leads` table is Facebook-lead-only. Most real sales prospects are GHL-only and will have `lead_id = null` in `call_logs`.
2. **Voicemail calls** — these sync correctly but Claude extracts minimal data (sentiment neutral, interest 1). Filter by `summary ILIKE '%voicemail%'` if you want to exclude them from the UI.
3. **Granola processing delay** — notes appear 2–5 minutes after a call ends. The 2-minute cron handles this fine.
4. **iOS vs macOS transcript format** — handled in `formatTranscript()` but both sides show as `microphone` on iOS with diarization labels.
5. **Phone format in `leads` table is inconsistent** — mix of E.164, formatted `(972) 555-0148`, and raw digits. Phone matching tries multiple variants but may still miss unusual formats.
