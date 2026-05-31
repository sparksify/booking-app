-- Migration 012: Revenue tracking — revenue per close setting
ALTER TABLE settings ADD COLUMN IF NOT EXISTS revenue_per_close INTEGER DEFAULT 0;
