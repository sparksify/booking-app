-- Migration 009: Add GHL opportunity tracking to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ghl_opportunity_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;
