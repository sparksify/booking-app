-- Migration 018: Add developer contact fields to nurture_brands
ALTER TABLE nurture_brands
  ADD COLUMN IF NOT EXISTS developer_name  TEXT,
  ADD COLUMN IF NOT EXISTS developer_phone TEXT,
  ADD COLUMN IF NOT EXISTS developer_email TEXT;
