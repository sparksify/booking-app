# DealOS Conversion — Audit of Existing Nurture Functionality

Date: 2026-08-10 · Branch: `claude/kanso-nurture-dealos-conversion-yrt1k8`

This is the pre-implementation audit required before converting the Kanso **Nurture**
module into **DealOS**. It inventories what exists, what will be reused, modified,
deprecated, and newly created, then defines the data model and task sequence.

---

## 1. What exists today

### Schema (migrations 017, 018, 020)
- `nurture_clients` — the candidate: identity, `status ('active'|'closed'|'archived')`,
  `funding_intro_done`, `last_contacted_at`, `entered_at`, `notes`, `milestones` JSONB
  (`funding` / `attorney` objects, written by modals).
- `nurture_brands` — one row per candidate×brand: `stage INT 1–5` (Intro Call, Unit
  Economics, FDD Review, Confirmation Day Invite, Committed), `sentiment`
  (candidate sentiment toward the brand), `note`, `developer_name/phone/email`.
  Upserted by name (`nurture-brand.js`), not by id.
- `nurture_touchpoints` — contact log: `medium CHECK ('call','email','text')`, `note`,
  `created_by`, `created_at`. No party dimension (candidate vs developer) and no
  deal linkage — everything is candidate-level.

### Server (pages/api/dashboard/)
- `nurture-clients.js` (GET) — joins the three tables, computes `days_since_contact`,
  `days_in_process`, **decay** (`urgent` ≥14d or never, `warning` ≥7d, `good`),
  `max_stage` (max of brand stages — treated as *the candidate's* stage), and
  `funding_needed`. Sorting = decay bucket, then staleness. **days-since-contact is
  the only prioritization signal.**
- `nurture-update.js` (POST) — patch client status/notes/milestones/funding flag.
- `nurture-brand.js` (POST) — upsert brand stage/sentiment/note/developer contact.
- `nurture-touchpoint.js` (POST) — insert touchpoint + bump `last_contacted_at`.
- `nurture-conversation.js` (GET) — GHL conversation thread for a contactId.
- `mark-cq-received.js` (POST) — **CQ auto-creation**: on "Mark CQ Received" it
  stamps the booking, moves the GHL opportunity stage, and auto-creates a
  `nurture_clients` row + one `nurture_brands` row per lead franchise interest.
- Communication: `send-sms.js` (GHL conversations, `sms:` fallback), `send-email.js`
  (GHL conversations, `mailto:` fallback), `ghl-contact-detail.js` (tags + Liquid
  Cash / Territory custom fields), `send-imessage.js` (BlueBubbles; unused by Nurture).

### UI (`pages/dashboard/nurture.js`, 2,820 lines)
- List view (default), Kanban by `max_stage`, "Today's Queue" working mode driven
  purely by decay, `PipelineGraph` of the five hard-coded stages.
- `QueueCard` — the working surface: 3-question header (What stage? What happened
  last? What's next?), `getNextAction()` (stage-indexed hard-coded next step),
  milestones bar (funding/attorney modals), Disposition logger, per-brand
  `BrandCard` (stage stepper, sentiment, developer contact), and
  `CommunicationsPanel` (GHL feed + SMS/Email composer) as a co-equal panel.
- Dead code: `NurturePanel`, `PanelBrandCard`, `EmailModal` (dead path), `SmsModal`,
  `StatCard`.

### Known defects found during audit
1. Inline email compose posts `{to, …}` but `send-email.js` requires `to_email` →
   always 400; inline email send has never worked.
2. `medium: 'notes'` (brand notes + Disposition "Notes" tab) violates the DB CHECK
   (`call|email|text`) → silent 500; notes vanish on refresh.
3. Queue table renders 6 headers against 7 cells (misaligned columns).
4. `funding_intro_done` (column) vs `milestones.funding.done` (JSONB) disagree —
   nothing writes the column, so list vs card show different next actions and
   `funding_needed` stays true forever past stage 2.
5. `nurture-touchpoint.js` bumps `last_contacted_at` even when the insert fails.
6. Global `limit(1000)` on touchpoints, not per-client.

---

## 2. Reuse / Modify / Deprecate / New

### Reused as-is (do not rebuild)
- CQ auto-creation flow in `mark-cq-received.js` (small additive tweak only: new
  deals start as `deal_status='new'`).
- GHL integration: `nurture-conversation.js`, `ghl-contact-detail.js`,
  `send-sms.js`, `send-email.js`, `send-imessage.js`, `lib/ghl.js`.
- Candidate data (`nurture_clients`), brand/developer data, touchpoints history,
  funding & attorney milestone modals/data (`milestones` JSONB).
- Auth/permission plumbing: `guardDashboardPage`, `resolvePermissions`,
  `page_nurture` permission key (kept as the DealOS permission for compatibility
  with stored member overrides).
- Visual language: sidebar/shell styles, stage/sentiment palettes, modals.

### Modified
- `nurture_brands` → becomes the **deal/opportunity entity** (extended, not
  duplicated — see §3). `stage` is kept for back-compat but stops being the
  controlling business logic.
- `nurture_touchpoints` → gains `deal_id` and `party ('candidate'|'developer')`;
  medium CHECK widened to include `'note'` and `'meeting'` (fixes defect 2).
- `nurture-touchpoint.js` → accepts `deal_id`/`party`, normalizes medium, updates
  per-party last-contact timestamps.
- `lib/nav.js` → label `DealOS`, href `/dashboard/dealos` (perm key unchanged).
- `pages/dashboard/cq-recovery.js` hardcoded local nav → point at `/dashboard/dealos`.
- `mark-cq-received.js` → seeded deals get `deal_status='new'` (CQ received,
  not yet submitted) so the attention engine can surface "submit" actions.
- Fix defect 1 (email payload key) in the new composer.

### Deprecated
- `max_stage` as "the candidate's stage" — replaced by per-deal `deal_status`.
- The five hard-coded stages as controlling logic (palette retained only as legacy
  milestone labels).
- Decay (days-since-contact) as the *primary* prioritization — demoted to two
  fallback attention rules (candidate/developer contact overdue).
- Dead components (`NurturePanel`, `PanelBrandCard`, `SmsModal`, `StatCard`,
  legacy `EmailModal`) — not carried over.
- `/dashboard/nurture` route — kept only as a redirect to `/dashboard/dealos`.
- `funding_intro_done` column — superseded by `milestones.funding.done` (already
  the de-facto source of truth in the UI).

### Newly created
- Migration `033_dealos.sql` (additive only; no edits to applied migrations).
- `lib/dealos.js` — domain constants: universal deal statuses, event types,
  waiting-on parties + expected response windows, sentiment sets.
- `lib/dealAttention.js` — deterministic **Deal Attention Engine** (server-side,
  no AI): rule evaluation producing ACTION / REASON / OBJECTIVE items.
- `nurture_deal_events` table — granular milestones/events per deal (validation,
  discovery day, FDD, funding intro, attorney intro, award…), so different
  franchisors can have different processes.
- APIs: `dealos-deals.js` (enriched list + executive summary),
  `dealos-deal-update.js` (patch a deal by id), `dealos-event.js` (deal events).
- `pages/dashboard/dealos.js` — Today (default) / Pipeline (Kanban lives here) /
  Waiting On / Closed, plus the redesigned deal workspace (large NEXT ACTION card;
  GHL feed preserved but visually demoted).

---

## 3. Data model (migration `033_dealos.sql`)

`nurture_brands` (the deal) — added columns:

| Column | Type | Notes |
|---|---|---|
| `deal_status` | TEXT CHECK | `new, submitted, connected, due_diligence, final_evaluation, decision, signed, paid, closed` — universal statuses; backfilled from `stage` (1→submitted, 2→connected, 3→due_diligence, 4→final_evaluation, 5→decision) |
| `estimated_commission` | NUMERIC(12,2) | potential commission for this deal |
| `submitted_at` | TIMESTAMPTZ | candidate submitted to franchisor |
| `connected_at` | TIMESTAMPTZ | developer connection confirmed |
| `last_candidate_contact_at` | TIMESTAMPTZ | maintained by touchpoint API (party=candidate) |
| `last_developer_contact_at` | TIMESTAMPTZ | maintained by touchpoint API (party=developer) |
| `developer_sentiment` | TEXT CHECK | same set as existing `sentiment` (which remains **candidate** sentiment) |
| `next_action_type` | TEXT CHECK | `call, text, email, meeting, task` |
| `next_action_note` | TEXT | what to accomplish |
| `next_action_due_at` | TIMESTAMPTZ | drives "overdue next action" rule |
| `waiting_on` | TEXT CHECK | `candidate, developer, franchisor, funding, attorney, other` |
| `waiting_since` | TIMESTAMPTZ | drives "waiting beyond window" rule |
| `waiting_note` | TEXT | what we're waiting for |
| `next_event_type` / `next_event_at` | TEXT / TIMESTAMPTZ | denormalized "next upcoming event" |
| `stalled_reason` | TEXT | set when a deal is parked |
| `outcome` | TEXT CHECK | `won, lost, withdrawn` (null while open) |
| `closed_at` | TIMESTAMPTZ | when outcome was set |

New table `nurture_deal_events` (granular per-deal milestones/events):
`id, deal_id → nurture_brands, event_type` (`intro_call, unit_economics, fdd_review,
validation, discovery_day, confirmation_day, funding_intro, attorney_intro, award,
agreement_sent, signing, other`), `title, scheduled_at, completed_at,
debrief_done BOOL, notes, created_by, created_at`. Funding/attorney remain
checkpoints (events + existing milestones JSONB), never mandatory sequential stages.

`nurture_touchpoints` — added `deal_id UUID NULL`, `party TEXT DEFAULT 'candidate'
CHECK (candidate|developer)`; medium CHECK recreated as
`('call','email','text','note','meeting')`. Backfill: existing rows → `party='candidate'`.

### Attention engine rules (deterministic, priority-ordered)
1. CQ received but deal not submitted (`deal_status='new'`)
2. Submitted without confirmed developer connection (no `connected_at` after N days)
3. Completed franchisor event without candidate debrief (`completed_at` set, `debrief_done=false`)
4. Discovery Day / final evaluation completed without consultant debrief (same mechanism, event-type-specific messaging)
5. Upcoming Discovery Day / final evaluation without funding readiness
6. Upcoming final evaluation without attorney introduction (where applicable)
7. Agreement/award reached without signing follow-through
8. Overdue next action (`next_action_due_at < now`)
9. Waiting-on beyond expected response window (per-party windows)
10. Stalled deal (`stalled_reason` set, or no movement/contact past threshold)
11. Candidate contact overdue (fallback signal)
12. Developer contact overdue (fallback signal)

Every item = `{ action (type+label), reason, objective, priority, due }` —
ACTION / REASON / OBJECTIVE always present. Commission at risk = Σ
`estimated_commission` of deals whose top item is in a jeopardy class
(stalled, waiting-overdue, overdue action, no-debrief).

---

## 4. Implementation sequence (small, reviewable steps)

1. **This audit** (docs only).
2. Migration `033_dealos.sql` + `lib/dealos.js` domain constants.
3. `lib/dealAttention.js` + enriched `dealos-deals` API + `dealos-deal-update` +
   `dealos-event` + touchpoint API extension.
4. `pages/dashboard/dealos.js` — Today page (executive summary + action queue)
   with Call/Text/Email/Open Deal actions.
5. Deal workspace (NEXT ACTION card first; GHL feed demoted).
6. Pipeline (Kanban by universal status) / Waiting On / Closed views.
7. Naming migration: nav → DealOS, `/dashboard/nurture` → redirect, cq-recovery
   nav link, `mark-cq-received` seeds `deal_status='new'`.

Out of scope this sprint (explicitly): Granola transcription, handwriting OCR,
AI-generated summaries, brand-specific automated playbooks.
