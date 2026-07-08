-- Company Intel cache. One row per business domain: the auto-researched company
-- profile shown on the client card (Prospects + Meetings). Keyed by domain so
-- multiple contacts on the same company share (and reuse) one research pass.
CREATE TABLE IF NOT EXISTS public.company_intel (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain         text UNIQUE NOT NULL,
  ghl_contact_id text,
  lead_id        uuid,
  email          text,
  website_url    text,
  logo_url       text,
  company_name   text,
  what_they_do   text,
  industry       text,
  category       text,
  services       jsonb,
  company_size   text,        -- solo | small | mid | large | unknown
  location       text,
  owner_name     text,
  owner_title    text,
  scale_signals  jsonb,
  capital_signal text,        -- low | medium | high | unknown
  franchise_read text,
  raw            jsonb,        -- full model output, for future fields
  status         text DEFAULT 'ok',   -- ok | freemail | no_site | error
  error          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  refreshed_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_intel_ghl_contact_id ON public.company_intel (ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_company_intel_lead_id        ON public.company_intel (lead_id);
