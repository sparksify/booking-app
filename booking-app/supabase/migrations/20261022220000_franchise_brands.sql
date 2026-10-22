-- Reusable catalog of brands Genesis confirmed as franchises.
-- Deduped by domain and by brand. Service role only, same posture as genesis_leads.

CREATE TABLE IF NOT EXISTS public.franchise_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  brand_key TEXT NOT NULL,
  domain TEXT,
  city TEXT,
  city_key TEXT NOT NULL DEFAULT '',
  evidence_url TEXT,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('classifier', 'page', 'filing')),
  evidence_detail TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  found_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  external_id TEXT,
  scout_candidate_id UUID,
  override_reason TEXT,
  overridden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS franchise_brands_domain_uidx
  ON public.franchise_brands (lower(domain))
  WHERE domain IS NOT NULL AND domain <> '';

CREATE UNIQUE INDEX IF NOT EXISTS franchise_brands_brand_uidx
  ON public.franchise_brands (brand_key);

CREATE INDEX IF NOT EXISTS franchise_brands_found_at_idx
  ON public.franchise_brands (found_at DESC);

ALTER TABLE public.franchise_brands ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.franchise_brands FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_brands TO service_role;
