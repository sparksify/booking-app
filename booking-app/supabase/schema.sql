-- ─────────────────────────────────────────────────────────────────────────────
-- Run this once in your Supabase SQL editor to set up the database.
-- ─────────────────────────────────────────────────────────────────────────────

-- Team members (each person who connects their Google Calendar)
create table if not exists team_members (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text unique not null,
  google_access_token   text,
  google_refresh_token  text,
  token_expires_at      timestamptz,
  calendar_id     text default 'primary',   -- 'primary' uses their main calendar
  active          boolean default true,
  created_at      timestamptz default now()
);

-- Bookings (every confirmed slot)
create table if not exists bookings (
  id                uuid primary key default gen_random_uuid(),
  first_name        text not null,
  last_name         text not null,
  email             text not null,
  phone             text,
  slot_start        timestamptz not null,
  slot_end          timestamptz not null,
  assigned_to_email text references team_members(email) on delete set null,
  google_event_id   text,
  meet_link         text,
  created_at        timestamptz default now()
);

-- Settings (single row — id is always 1)
create table if not exists settings (
  id               int primary key default 1,
  work_start       int  default 9,        -- 24-hour, e.g. 9 = 9am
  work_end         int  default 18,       -- 24-hour, e.g. 18 = 6pm
  timezone         text default 'America/Chicago',
  meeting_duration int  default 30,       -- minutes
  meeting_title    text default 'Franchise Discovery Call',
  days_ahead       int  default 14,
  buffer_minutes   int  default 15,       -- buffer after each meeting before next slot
  updated_at       timestamptz default now(),
  constraint settings_singleton check (id = 1)
);

-- Seed default settings row
insert into settings (id) values (1) on conflict (id) do nothing;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists bookings_slot_start_idx on bookings (slot_start);
create index if not exists bookings_assigned_idx   on bookings (assigned_to_email);

-- ─── RLS (optional — enable if you want to restrict direct client access) ────
-- alter table team_members enable row level security;
-- alter table bookings      enable row level security;
-- alter table settings      enable row level security;
