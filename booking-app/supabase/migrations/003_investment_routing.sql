-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Investment-level routing + lead pipeline stages
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. team_members: which investment ranges this rep handles
--    Values: 'lt_100k' | '100k_250k' | '250k_500k' | 'gt_500k'
--    Empty array = handles ALL levels (fallback)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS investment_ranges text[] DEFAULT '{}';

-- 2. bookings: pipeline stage + investment level from Facebook
--    status values: 'scheduled' | 'showed' | 'qualified' | 'lost'
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS investment_level text;

-- Optional: free-form notes a rep can add from the dashboard
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS notes text;

-- Optional: raw FB attribution data (utm_source, fb_ad_id, etc.)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS fb_attribution jsonb;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_status           ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_investment_level ON bookings(investment_level);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned         ON bookings(assigned_to_email);
