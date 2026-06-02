-- Migration 020: Add milestones JSONB column to nurture_clients
-- Stores funding intro and attorney intro milestone data per client
-- Structure: { "funding": { "company": "...", "date": "...", "done": true },
--              "attorney": { "attorney_name": "...", "law_firm": "...", "date": "...", "done": true } }

ALTER TABLE nurture_clients
  ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '{}'::jsonb;
