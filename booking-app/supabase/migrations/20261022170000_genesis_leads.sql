-- Genesis on-demand lead pipeline. One row per business, deduped by external id, domain, and brand+city.
-- Dry runs do not write this table.

CREATE TABLE IF NOT EXISTS genesis_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  stage TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'Pending',
  business_name TEXT NOT NULL,
  brand_key TEXT NOT NULL,
  city TEXT,
  city_key TEXT NOT NULL DEFAULT '',
  industry TEXT,
  domain TEXT,
  website TEXT,
  owner_name TEXT,
  owner_first TEXT,
  owner_last TEXT,
  owner_role TEXT,
  owner_confidence TEXT,
  owner_sources JSONB NOT NULL DEFAULT '[]',
  owner_source_urls JSONB NOT NULL DEFAULT '[]',
  owner_source TEXT,
  owner_phone TEXT,
  owner_phone_source TEXT,
  business_phone TEXT,
  phone TEXT,
  email TEXT,
  inbox_type TEXT,
  email_source TEXT,
  verification TEXT,
  verification_detail JSONB NOT NULL DEFAULT '{}',
  flagged_emails JSONB NOT NULL DEFAULT '[]',
  icebreaker JSONB,
  icebreaker_sent BOOLEAN NOT NULL DEFAULT FALSE,
  lookup_at TIMESTAMPTZ,
  credits NUMERIC NOT NULL DEFAULT 0,
  cost_usd NUMERIC,
  calls JSONB NOT NULL DEFAULT '[]',
  stage_log JSONB NOT NULL DEFAULT '[]',
  signal TEXT,
  website_excerpt TEXT,
  rating NUMERIC,
  review_count INTEGER,
  hold_reason TEXT,
  scout_candidate_id UUID,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS genesis_leads_external_id_uidx
  ON genesis_leads (external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS genesis_leads_domain_uidx
  ON genesis_leads (lower(domain)) WHERE domain IS NOT NULL AND domain <> '';
CREATE UNIQUE INDEX IF NOT EXISTS genesis_leads_brand_city_uidx
  ON genesis_leads (brand_key, city_key);
CREATE INDEX IF NOT EXISTS genesis_leads_status_idx
  ON genesis_leads (status, updated_at DESC);
