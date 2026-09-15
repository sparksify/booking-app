# FCC reminders inside Deal Desk

## Activation (off by default)

1. In the Google Cloud project for Kanso's existing `GOOGLE_CLIENT_ID`, enable **Gmail API**. Keep the existing Calendar API and OAuth redirects.
2. Add `https://app.trykanso.co/api/dashboard/fcc/callback` as an authorized redirect URI for that web OAuth client (the implementation derives this from `NEXTAUTH_URL`).
3. Configure the Google consent screen for `https://www.googleapis.com/auth/gmail.readonly`. This is a restricted Google scope. If the OAuth app is in Testing, add the receipt mailbox as a test user; testing refresh tokens may expire after seven days. Workspace policy or Google's verification requirements may require administrator action. Do not bypass an access block or claim permanent access from a one-time test.
4. Production needs the existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, public Supabase URL, and `CRON_SECRET`. No Gmail secrets go to the browser. Changing `NEXTAUTH_SECRET` requires reconnecting the mailbox.
5. Open **Meetings → FCC reminders → Connect Gmail (read-only)**. Choose `ssparks@thefranchiseconsultingcompany.com` and approve read-only access. This is separate from Kanso's existing Calendar connection.
6. Under timing/contacts, configure canonical brand aliases and verified franchise developer addresses. An existing deal's saved developer email also counts. Do not add shared email-provider domains.
7. Preview the last 7 days. Inspect matches before selecting/importing any real historical receipts. Unknown/ambiguous brands and forwarded/unverified receipts go to review, not automatic deal creation. An unrecognized format must be inspected before activation.
8. **Activate new receipts from now**. The scheduler runs every five minutes. The default due date is the next weekday at 9 AM in America/Chicago. No holiday calendar is configured. A growing mailbox backlog is processed in bounded batches, with unavailable/catch-up state shown until checks complete.

Google references: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Safety and behavior

- Deterministic parsing uses the FCC heading, labeled fields, and Google-authenticated Jotform sender. It does not use an unverified subject rule, AI classification, attachments, or outbound sending.
- Only candidate contact data, territory, submission identity/time, and short supporting acknowledgment excerpts are stored. Net worth, address, narrative, and attachment contents are excluded from receipt records.
- Canonical email+brand matching is consultant-scoped; cross-consultant, ambiguous, and inactive deals require review. New trusted submissions receive a pending candidate next action; CQ/introduction timestamps are not fabricated. Advanced deal stages, developer information, notes, and existing next actions stay unchanged.
- FCC obligations are separate from `deal_followups`. Acknowledgment changes only the obligation. Attempt/Snooze reschedule it without claiming contact. Developer planned contact, developer-reported contact, and candidate-confirmed contact are independent facts.
- Only newly authored incoming text from verified contacts is eligible for automatic acknowledgment. Quoted content, own outbound mail, automatic replies, wrong candidates, and explicitly wrong brands are excluded. Ambiguous evidence is marked for review. Shared brand contacts require authored brand evidence for multi-brand candidates.
- Direct deliveries and forwarded copies with identical structured fields are conservatively deduplicated. A reliably labeled submission ID or timezone-bearing timestamp distinguishes otherwise identical resubmissions. Without that evidence, identical-content resubmissions remain one obligation rather than producing duplicates.
- Paused/won/lost deals are excluded from automated checks and the active feed. Resume restores eligibility without altering FCC evidence or postponing the original obligation. Stale checks show unavailable until the next successful sync.
- Future schedules are shown as scheduled. A missing acknowledgment is reported only when a successful scan covers the due date and is recent (30 minutes). Access failures never become a confirmed missing acknowledgment.
- The mailboxes, rules, submissions, and evidence tables have RLS enabled, no browser policies/grants, and service-role-only access. Transaction functions use invoker rights, explicit ownership checks, row/advisory locks, and unique keys. Server APIs require an active member, Meetings permission, and same-origin JSON mutations.
- Preview deployments cannot connect mailboxes, import mail, mutate obligations, or run the scheduler. Production/preview currently use shared environment-variable scopes; never run candidate-write tests there.
- Disconnect erases Kanso's Gmail token and disables processing while preserving history. It does not revoke the shared Google Calendar grant. Full Google app revocation can be done in Google Account → Third-party connections and may also disconnect Calendar.

## Verification

`npm test` runs parser/date/classifier tests, injected server/API security tests, and actual transaction tests in a temporary PostgreSQL cluster if `initdb`, `pg_ctl`, and `psql` are installed. Integration tests explicitly report skipped when PostgreSQL is absent; a skip is not a database pass. The local cluster contains synthetic records only and is removed after testing.

The additive migration `20260915013850_fcc_deal_reminders.sql` depends on Deal Desk migrations 033–035. Do not rewrite or rerun those existing migrations against production merely to add this feature. Verify their schema/functions first.

Browser tests use a temporary, local-only synthetic harness with the real components; remove it before the final build and commit. Test centered dialogs at 390×844 and 1440×900, clear-date prevention, contact attempt, Snooze, acknowledgment completion, editable mailto draft, and preservation of the independent next action. No real email is sent.

Live ingestion is not verified until the correct Google mailbox is authorized, a real receipt dry-run matches its actual format, and a prospective receipt/reply is observed. A build, a connected Codex Gmail tool, or a preview deployment is not evidence of that end-to-end verification.
