# Grok → Genesis intake

The connection is `POST https://app.trykanso.co/api/genesis/intake` after deployment.
Give Grok `public/genesis-grok-instructions.txt`, the OpenAPI schema at
`/genesis-intake-openapi.json`, and its dedicated token through a private credential setting.
The signed-in form and review inbox are under **Genesis Agent → Incoming Leads**.

## Routing

One prequalified independent business per request. `business_name` is required,
plus an email, website, owner name, phone, or city. Optional research, franchise
potential, industry, and contact fields are retained. An existing franchise is rejected.

* With email: verify only with MillionVerifier; skip owner discovery and enrichment.
* Without email: existing owner discovery → existing email enrichment waterfall.
* Both paths skip scout/filter and save into `pipeline_prospects`.
* Only verified addresses or the existing verified vendor results become ready for
  review. Missing verifier, catch-all, invalid, and inconclusive addresses stay held.
* The inbox's **Load into outreach campaign** button uses the existing Genesis
  sequence writer and Smartlead campaign. Submission does not automatically send.

## Deployment

1. Apply `supabase/migrations/20260917115046_genesis_intake.sql` to the Kanso database.
   Existing pipeline migrations 029 and 030 must already be applied.
2. Set a new random `GENESIS_INTAKE_API_KEY` server environment variable (at least
   32 random bytes). Share only this scoped token with Grok; never database keys.
3. Ensure `CRON_SECRET` is configured. The Vercel cron calls
   `/api/cron/genesis-intake` every minute. This requires a Vercel plan that supports
   per-minute schedules. Previews deliberately do not process the queue.
4. Ensure `MILLIONVERIFIER_API_KEY` and existing discovery/enrichment credentials
   are configured. Outreach additionally uses existing `SMARTLEAD_API_KEY`,
   `SMARTLEAD_CAMPAIGN_ID`, and `ANTHROPIC_API_KEY`.
5. Deploy the app. Check a real submission only with an authorized test business.

The API fails closed until its token is configured. Its status endpoint requires
the same bearer token. The form uses the existing active-member and Genesis-page
permission checks; the API token is never returned to the browser.

## Reliability and review

POST returns 202 after the database saves the receipt. It requires an
`Idempotency-Key`; identical retries return the same receipt, changed data returns
409. Each cron tick claims at most three stage jobs using a conditional database
update. Results are checkpointed between verify/discover/enrich/save. Claims older
than ten minutes are recoverable; three failed attempts hold the receipt for a
manual retry. Saving uses the receipt UUID as the prospect UUID, preventing a
second prospect on retry. GET reports queue progress and final outcome.

Do not interpret 202 as verified or loaded. Never automatically retry an ambiguous
campaign load: check Smartlead first. The campaign-loading database claim prevents
double clicks from sending a lead twice. Failed or uncertain campaign requests need
manual reconciliation. Corrected contact details use a new submission key.

Intake website crawling pins requests to public IPv4 DNS answers and rechecks each
redirect. Private IPs, credentials, custom ports, IPv6 URLs, and excessive redirects
are rejected. Sites available only over IPv6 may rely on the search discovery fallback.

## Local verification

`node --test tests/genesisIntake.test.mjs` exercises routing, validation, auth,
receipts, stage claims, retries, and persistence using synthetic data and mocked
vendors. `npm run build` checks Next.js compilation. These checks do not send email.
