-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Slot display settings — max visible slots + scarcity hiding
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS max_slots_per_day  integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS hidden_slots_count integer NOT NULL DEFAULT 1;
