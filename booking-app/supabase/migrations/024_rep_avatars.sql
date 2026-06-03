-- Migration 024: rep avatar photos per team member
-- Stored as JSONB keyed by email (and name for GHL name-based lookups)
alter table settings
  add column if not exists rep_avatars jsonb default '{}'::jsonb;
