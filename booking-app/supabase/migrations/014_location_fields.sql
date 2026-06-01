-- Migration 014: Territory / location fields on leads
-- Paste into Supabase SQL Editor and Run.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS location_raw       TEXT,
  ADD COLUMN IF NOT EXISTS location_city      TEXT,
  ADD COLUMN IF NOT EXISTS location_state     TEXT,
  ADD COLUMN IF NOT EXISTS location_zip       TEXT,
  ADD COLUMN IF NOT EXISTS location_area_code TEXT;
