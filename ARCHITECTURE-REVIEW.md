# KANSO Architecture Review — Pre-Olivia Assessment

Reviewed: 2026-08-01. Scope: full codebase (`booking-app/` — Next.js pages router + Supabase, ~35k lines, 94 API routes, 40+ migrations) plus the BASSEE-LLC marketing site. This is the honest CTO-level assessment requested before building Olivia (the AI employee OS) on top of this platform.

**Verdict in one paragraph:** KANSO is an impressively fast-moving, feature-rich internal tool for one company with two reps — and it is not currently a platform. The five engines work because volume is low, the team is tiny, and everyone trusts each other. There are exploitable security holes, silent data-loss bugs in the money path, no tenancy model, no engineering safety net (zero tests, CI, types, lint), and no durable background-job infrastructure. Every one of those gaps is survivable today and fatal at 100 employees / 10,000 customers — and several of them are exactly the primitives Olivia will need on day one.

---

## 1. Security: the fire, not a nice-to-have

These are exploitable today, not theoretical.

1. **Anyone with a Google account becomes an active team member.** `pages/api/auth/[...nextauth].js:48-68` upserts every Google sign-in into `team_members` with `active: true` and returns `true` unconditionally — no allowlist, no domain check, no invite. A self-registered stranger gets the default `member` permission set, shows up as a bookable rep in `/api/availability`, and deactivating a rep is undone on their next login (the upsert rewrites `active: true`).
2. **Arbitrary table delete.** `pages/api/dashboard/leads.js:40-44` passes `req.body.table` straight to `supabase.from(table).delete()` on the service-role client with zero validation. Any authenticated session can delete rows from `team_members`, `settings`, `brands` — anything with an `id` column.
3. **Unauthenticated CRM proxy.** `pages/api/mobile/contacts/[id].js` never checks a session. `GET /api/mobile/contacts/x?email=<anything>` returns full GHL contact detail — name, phone, liquid capital, net worth, tags — for any email. Open PII enumeration of the entire CRM.
4. **Authorization exists but is not enforced.** `lib/permissions.js` is a well-designed granular permission model — and only 7 of ~62 authenticated API routes consult it. Everything else stops at "has a session." A member with `settings_team_members: false` in the UI can still call `POST /api/dashboard/settings` directly. The 62 hand-copied session checks are exactly why the mobile route above was missed.
5. **RLS is off everywhere.** `schema.sql:54-57` comments it out as "optional." The anon key is `NEXT_PUBLIC_` and shipped to every browser; with RLS off, the Supabase REST endpoint will happily serve `leads`, `bookings`, and `team_members` — which stores **plaintext Google OAuth refresh tokens** with full calendar scope (`schema.sql:10-11`), plus `settings.bluebubbles_password`, which is also returned to any session by `GET /api/dashboard/settings`.
6. **Every webhook/cron secret fails open.** The `if (process.env.SECRET && ...)` idiom (`webhooks/pabbly.js:41`, `webhooks/bluebubbles.js:37`, `cron/fb-ads-tick.js:12`, `webhooks/pipeline-reply.js:42`) means a missing or typo'd env var silently turns an authenticated endpoint into a public one. Secrets are also accepted in query strings (logged everywhere) and compared with `!==` instead of `timingSafeEqual`.
7. **Eleven unauthenticated `pipeline/*` routes spend real money.** No auth on any of them; `discover.js`, `enrich.js`, `outreach.js` accept unbounded arrays and fan out to Anthropic, SerpAPI, FullEnrich, Smartlead, etc. One anonymous POST with a 10,000-element array is a financial DoS across six paid accounts — and `outreach.js` injects arbitrary contacts into a live outbound campaign under your domain. Debug endpoints (`debug-scout.js`, `scout-debug.js`, `test-*.js`) are also live in production.
8. **`ilike` wildcard injection in the admin layer.** `set-role.js:34` uses `.ilike('email', req.body.email)`; posting `{email: "%", role: "admin"}` matches every row. Same pattern in 8+ other routes.
9. **Google refresh token exposed to the browser.** `[...nextauth].js:43` puts `refreshToken` on the session object, which NextAuth serves as JSON to client-side script.
10. **Zero rate limiting** on any public endpoint, including `/api/book`, `/api/events` (unauthenticated unbounded insert), and `/api/lead`.

**Why this matters for Olivia:** an AI employee is an automated actor with credentials and tool access. Building it on an API layer where authorization is optional and secrets fail open means every bug in Olivia's tool-calling becomes a breach amplifier.

## 2. You can no longer reconstruct your own database

- **Twelve production tables have no DDL in the repo** — `meeting_status_overrides`, `meeting_transfers`, `freebusy_cache`, `confirmation_cache`, `sync_state`, `call_logs`, `contact_notes`, `fb_ad_rules`, `fb_ad_flags`, `fb_ad_snapshots`, `unmatched_calls`, `pipeline_franchises`. They were created by hand in the SQL editor. Code depends on constraints in them that exist only in prod (e.g. the `onConflict: 'email,slot_start'` upsert in `update-booking-status.js:105`).
- **The authz model itself is undeclared**: `team_members.role` and `team_members.permissions` have no migration.
- **Two `supabase/` directories** (repo root and nested app) with a byte-identical duplicated `003` and **colliding migration numbers** — two different `030`s and two different `031`s. The migration ledger is fiction; six migrations literally say "run this in the SQL editor."
- `schema.sql` has drifted into a 2023-era snapshot (declares `bookings.email not null`, dropped by migration 030; shows 11 of ~25 booking columns).
- The repo root also carries a **dead parallel tree** — an orphaned `pages/` (heavily diverged: `leads.js` differs by 1,012 lines from the real one), a stale 3-file `supabase/`, and the original single-file `index.html` prototype.

First remediation step for anything: `pg_dump --schema-only` against prod, reconcile, commit the truth, collapse to one migrations directory, and never touch the SQL editor again.

## 3. Correctness bugs in the paths the business runs on

- **No slot reservation exists.** No hold table, no lock, no unique constraint on `bookings(assigned_to_email, slot_start)`. `/api/book` re-checks freeness (`book.js:133`), then does two network round-trips before inserting (`:279`). Two leads clicking the same hot slot both get confirmed. The legacy path (`:152-180`) has no freeness check at all, and the "safety net" fallback (`:182-208`) deliberately books a known-busy rep from outside the brand when brand routing exhausts — and swallows calendar-event failures on the way.
- **`/api/book` lies about failure.** DB insert errors are logged and execution continues to `res.json({ success: true })` (`book.js:298→484`). The lead gets a confirmation email for a booking that doesn't exist.
- **`/api/availability` fabricates slots on error.** The catch branch (`availability.js:157-160`) returns `mockSlots()` — a *seeded random generator* — so when a Google token expires, real customers are shown and can book imaginary availability, including past times.
- **The GHL sync is fire-and-forget after the response.** `book.js:373` runs the entire contact→opportunity→appointment→workflow sync in an un-awaited IIFE after `res.json()`. Vercel can freeze the instance the moment the response flushes; bookings non-deterministically never reach the CRM, with no record of the failure. (The Facebook webhook learned this lesson — `webhooks/facebook.js:146-148` has a comment about it — and the fix never made it to `book.js`.)
- **The Granola cron silently loses data forever.** `sync-granola.js:418` advances the watermark unconditionally even when notes errored; failed notes are skipped permanently. It also runs every 2 minutes with a 60-second budget and a serial per-note loop containing a Claude call — guaranteed to time out under backlog, with overlap races that double-count `leads.call_count` and double-spend on Claude. Unguarded property access (`:366-368`) means a phone-call note without attendees throws → permanently skipped.
- **Google token refresh is broken by design.** Refreshed access tokens are never persisted back (`googleCalendar.js` has no `tokens` handler); every calendar call re-exchanges the refresh token. When a rep revokes access, busy-time fetch returns `[]` — "completely free" — and that rep absorbs every booking. `token_expires_at` is written once and never read.
- **Round-robin routing is a lost-update race.** `routing.js:98-147` does a read-modify-write on a jsonb counter and fires the increment un-awaited. Concurrent bookings route to the same rep; the weighting feature defeats itself under load. The tier parser also reads only the *lower* bound (`routing.js:58-69`), so "under $500,000" routes as a $500k+ lead.
- **Inbound iMessage tracking has never worked.** `webhooks/bluebubbles.js:30` imports `logEvent`, which doesn't exist (`lib/leadEvents.js` exports `logLeadEvent` with a different signature). Every inbound message from a matched lead throws.
- **Status overrides are keyed on a fuzzy hash.** Rep-marked statuses for Calendly/GHL meetings live in `meeting_status_overrides` keyed by `email + 30-minute time bucket` (`bookings.js:205`). Reschedule by 30+ minutes and the no-show mark silently detaches.
- **Analytics counts a status that can't exist.** `analytics.js:50-51` computes revenue against `status = 'closed'`, a value the write path's whitelist (`leads.js:6`) refuses to accept. Revenue-per-close is likely reporting zero.
- **Watch-funnel tokens are guessable.** `facebookLeads.js:72-75` generates the sole authenticator for lead PII URLs with `Math.random()` (~8 chars), while two other code paths use `crypto.randomBytes` for the same field.

## 4. There is no platform underneath the product

- **No tenancy.** No org/workspace/account concept anywhere (grep confirms zero hits). `settings` is a literal singleton (`check (id = 1)`, 27 call sites of `.eq('id', 1)`) holding ~25 accreted global columns. `brands.slug` is globally unique. GHL location, Calendly user, calendar IDs, pipeline/stage UUIDs are compile-time constants (`book.js:13-23`, `bookings.js:11-18`). Serving customer #2 means a separate deployment — viable to ~5 customers, not 10,000.
- **Identity is an email string.** No canonical person entity. `bookings.assigned_to_email` FKs the *email* natural key; `leads.email` isn't even unique — duplicates are created intentionally and read paths compensate with "most recent row wins" in six places. `lead_events.lead_id` is TEXT holding a Facebook token with no FK. Two employees' names are compiled into the authorization layer as regexes (`lib/role.js:14-16`) — any future hire whose email starts with `john@` scopes into John Doty's data.
- **Two incompatible event tables**, one of which (`events`) is written by a public unauthenticated endpoint and read by nothing.
- **No soft deletes, no audit trail, no `updated_at` triggers** anywhere — hard `DELETE` on a CRM holding commission data.

## 5. No engineering safety net, and copy-paste as the reuse strategy

Hard zeros across ~35k lines: **0 tests, 0 CI (no `.github` dir), 0 lint config, 0 formatter, 0 TypeScript.** `package.json` scripts are `dev`/`build`/`start`.

The duplication is structural, not cosmetic:
- The ~1,000-line CRM panel exists **twice** (`pages/dashboard/bookings.js:1415` and `components/CrmPanel.js:104`) with 34 identically-named functions, already diverged.
- The booking widget exists **three times** (`pages/index.js` 909 lines, `pages/[brand].js` 832, `book-v1.js`), sharing 13 duplicated function names, drifted by ~1,400 lines.
- `GHL_API`/`GHL_VERSION` re-declared **15 times** across API routes despite `lib/ghl.js` existing; `sync-granola.js` hand-rolls its own GHL client.
- `function SideIcon` defined **11 times** — there is no `<DashboardLayout>`; the sidebar is re-implemented per page.
- God components: `nurture.js` 2,820 lines; `bookings.js` 2,474 lines with **88 `useState` and 28 raw `fetch` calls**; `settings.js` has a single 1,011-line component. No SWR/react-query/context — every screen hand-rolls loading/error state. Three parallel styling systems (one orphaned global CSS file, inline `style={{}}` everywhere, raw `<style>` blocks — including CSS injected from the database via `dangerouslySetInnerHTML`).
- The mobile PWA is a fourth parallel client with its own parallel API surface (`api/mobile/*`) re-implementing the dashboard's fetch/normalize logic.

At 2 engineers this is annoying. At 20 it's a velocity ceiling: every fix must be found and applied in 2-4 places, and nothing catches the places you missed.

## 6. Scale cliffs

- **The dashboard is an N+1 monster.** One load of `/api/dashboard/bookings` with `filter=all` fans out to Calendly (`/users/me` + paginated events + one `/invitees` call *per event*) and GHL (calendars + one `/users/{id}` per rep + one `/contacts/{id}` per event + one search per unmatched email) — **hundreds of external API calls per page view, uncached**. The code already hit GHL rate limits and responded by removing enrichment from one path (`bookings.js:420-422`) — treating the symptom. When a provider is down, meetings silently vanish from the dashboard.
- **Full-table scans on every dashboard load**: `meeting_status_overrides` and `meeting_transfers` are selected with no filter or limit (`bookings.js:199-218`) and grow forever. `freebusy_cache` and `confirmation_cache` have read-TTLs but no eviction — monotonic growth, no cleanup cron.
- **Missing indexes on the hottest queries**: `leads(phone)` — seq-scanned by 8-variant `.in()` lookups on a cron firing 720×/day (`sync-granola.js:151-155`); `lead_events(event_type, created_at)` — analytics filters in the heap and silently truncates at `.limit(10000)`; `bookings(email)`. Meanwhile duplicate and useless indexes are maintained on every write (`bookings_assigned_idx` + `idx_bookings_assigned` are identical; single-column indexes on 4-value enums).
- **The background-job system is two Vercel crons.** No queue, no retries, no backoff, no DLQ, no idempotency keys, no alerting anywhere. A cron can be dead for a week and the only signal is an empty UI. Everything that should be a job (LLM company intel, CloseBot attribution, confirmation classification) runs inline in request handlers.
- **Polling everywhere**: 2-minute cron, 30-second `setInterval` per open dashboard tab, no Supabase Realtime, no caching layer.

## 7. The AI layer is 12 raw fetches with no governance

There are 12 direct `fetch` calls to the Anthropic API (plus one OpenAI images call) with no shared client, no timeouts, no usage logging, no rate limits, no spend caps, and no structured output — JSON is scraped out of markdown fences three different ways (one with a regex typo: `` /^```json?/ `` matches `jso`). A rep refreshing a 60-meeting dashboard can fire 60 classifier calls. Scraped third-party website text is interpolated raw into prompts whose output is shown to reps as a qualification signal — a working prompt-injection channel (`companyIntel.js:96-117`). Exactly one call site (`check-confirmation.js`) has a non-LLM fallback and output validation; it should be the template for all of them.

For an **AI employee OS**, this is the part to take most seriously: Olivia is, architecturally, "many LLM calls with tool access running as durable background jobs under a permission model with an audit trail." KANSO currently has none of those five primitives — no LLM gateway, no tool-permission model, no durable jobs, no idempotency, no audit trail.

---

## What I would actually do, in order

**Week 1 — stop the bleeding (no architecture, just fixes):**
1. Close the sign-in hole: allowlist/domain-check in the NextAuth `signIn` callback; stop resurrecting `active: true` on login.
2. Fix `dashboard/leads.js` DELETE/PATCH (whitelist tables, check permissions). Add the missing session check to `mobile/contacts/[id].js`. Kill or auth the `pipeline/*` and debug endpoints.
3. Invert every fail-open secret check to fail-closed; move secrets out of query strings.
4. Enable RLS deny-all on every table (service role is unaffected — zero-risk change). Stop returning `bluebubbles_password` and the client-side refresh token.
5. Await the GHL sync in `/api/book` (or queue it — see below); return real errors from `/api/book`; delete `mockSlots`.
6. Add a unique constraint on `bookings(assigned_to_email, slot_start)` and handle the conflict — that one constraint converts the double-booking race into a retryable error.
7. Stop the Granola watermark from advancing past failures; fix the `logEvent` crash; persist refreshed Google tokens with a `tokens` event handler.
8. `pg_dump --schema-only` prod → commit the real schema, collapse to one migrations dir.

**Month 1 — the four structural moves that pay for Olivia:**
1. **One `withAuth(permission)` wrapper** replacing all 62 hand-rolled session checks, enforcing `lib/permissions.js` at the API layer. This collapses half the security findings and gives Olivia the permission primitive it needs to act *as* someone.
2. **A durable job queue** (Inngest, Trigger.dev, QStash, or Supabase queues + a worker) for everything that talks to an external system: GHL sync, Granola processing, company intel, conversion events, email. Retries, idempotency keys, DLQ, alerting. Olivia's every action is a background job; this is her runtime, so build it once, before her.
3. **An LLM gateway module**: one client with timeouts, structured output (tool-use JSON mode), usage/cost logging per call site, per-user rate limits, injection-hardened prompt assembly, and a fallback pattern. All 12 call sites move onto it; Olivia's calls are born onto it.
4. **A canonical `people` entity + `org_id` on every table now**, while the data is small enough to backfill in an afternoon. Kill the `settings` singleton (make it per-org rows), move hardcoded GHL/Calendly IDs into per-org integration config, delete the name-regexes in `role.js`. You don't need full multi-tenant UX yet — you need the *columns* to exist before 10,000 customers make the backfill a six-month project.

**Quarter 1 — engineering system:**
- TypeScript (incrementally, new files first), ESLint + Prettier, CI running build + lint + a test suite that starts with the pure logic that already exists (`scoring.js`, `routing.js` — they're well-isolated and testable today) and the booking/availability contract.
- Extract `DashboardLayout`, one CRM panel, one booking widget, one GHL client; adopt a data-fetching layer (react-query/SWR) instead of 88-useState pages.
- Provider adapters (`CrmProvider`, `CalendarProvider`) so GHL/Calendly stop being welded into route handlers — Olivia will need to drive these same integrations through a clean interface anyway.
- Observability: error tracking (Sentry), structured logs, alerts on cron failure and queue depth. Right now failure is invisible by design.

**What I would *not* do:** rewrite. The product logic is real and the domain knowledge encoded in these 35k lines is the company's actual moat. The stack (Next.js + Supabase + Vercel) is fine for 100 employees and 10,000 customers *if* the four structural moves land. This is a hardening-and-extraction job, not a green-field job — and doing it now, before Olivia, is the difference between Olivia inheriting a permission model, a job runtime, and an audit trail versus inheriting 15 copies of a GHL client and a database nobody can reconstruct.
