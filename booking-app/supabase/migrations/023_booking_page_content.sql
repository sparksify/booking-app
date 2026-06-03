-- Migration 023: editable booking page copy
alter table settings
  add column if not exists booking_headline     text default null,
  add column if not exists booking_subtitle     text default null,
  add column if not exists booking_description  text default null,
  add column if not exists booking_meeting_type text default null;
