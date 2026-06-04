-- Migration 025: BlueBubbles iMessage integration credentials
-- Adds server URL and password fields to the settings table.
-- These are stored server-side only and never exposed to the client.

alter table settings
  add column if not exists bluebubbles_url      text    default null,
  add column if not exists bluebubbles_password text    default null;
