-- Migration 008: Multi-brand franchise interests + settings expansions
-- Run in Supabase SQL Editor

-- 1. Add franchise_interests to leads (replaces single franchise_brand / developer_* fields)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS franchise_interests JSONB DEFAULT '[]'::jsonb;

-- Structure per element:
-- { "id": "string", "brand": "string",
--   "developer_name": "string", "developer_phone": "string", "developer_email": "string" }

-- 2. Add brand_pitches to settings
--    Format: { "Brand Name": "pitch script text..." }
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS brand_pitches JSONB DEFAULT '{}'::jsonb;

-- 3. Add form_tag_rules to settings
--    Format: [{ "id": "string", "form_id": "string", "form_name": "string", "tags": ["tag1","tag2"] }]
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS form_tag_rules JSONB DEFAULT '[]'::jsonb;
