-- Migration 007: Add franchise/developer/notes fields to leads
-- Run in Supabase SQL Editor

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS franchise_brand   text,
  ADD COLUMN IF NOT EXISTS developer_name    text,
  ADD COLUMN IF NOT EXISTS developer_phone   text,
  ADD COLUMN IF NOT EXISTS developer_email   text,
  ADD COLUMN IF NOT EXISTS notes             text;
