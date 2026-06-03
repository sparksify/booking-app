-- Migration 022: host avatar URL for booking page
alter table settings
  add column if not exists host_avatar_url text default null;
