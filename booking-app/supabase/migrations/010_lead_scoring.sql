-- Migration 010: Add lead scoring columns to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lead_score       SMALLINT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS show_probability SMALLINT;
