-- Migration 021: Calendar event fields for Google Calendar invites
-- Adds editable description template, location, color, and reminder fields
-- to the settings table.

alter table settings
  add column if not exists event_description    text    default null,
  add column if not exists event_location       text    default null,
  add column if not exists event_color          integer default null,
  add column if not exists event_reminder_mins  integer default 15;
