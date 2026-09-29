-- Person Intel: web-researched dossier for an individual lead, keyed by email.
-- Populated by lib/personIntel.js (Perplexity Sonar via OpenRouter) and read by
-- the Person Dossier card in the Meetings CRM panel.
create table if not exists public.person_intel (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  lead_id             uuid,
  ghl_contact_id      text,
  full_name           text,
  headline            text,
  summary             text,
  current_title       text,
  employer            text,
  location            text,
  relevance           text,
  relevance_reason    text,
  background          jsonb,
  business_interests  jsonb,
  capital_signal      text,
  online_presence     jsonb,
  notable_facts       jsonb,
  franchise_read      text,
  confidence          text,
  sources             jsonb,
  raw                 jsonb,
  status              text,
  error               text,
  refreshed_at        timestamptz,
  updated_at          timestamptz default now(),
  created_at          timestamptz default now()
);

create index if not exists person_intel_lead_id_idx on public.person_intel (lead_id);
create index if not exists person_intel_ghl_idx     on public.person_intel (ghl_contact_id);
