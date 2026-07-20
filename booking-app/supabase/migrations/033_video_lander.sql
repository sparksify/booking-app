-- Migration 033: Video lander (Wistia VSL) — per-brand video config + first-party view events
--
-- Flow mirrors the /r/[brand] booking prefill:
--   FB Lead Ad button → /r/watch/[brand] → claims the freshest lead →
--   302 → /watch/[brand]?first_name=&email=&lead_id=... →
--   Wistia player identified by the lead's email (Wistia Stats API can then
--   return per-viewer heatmaps), while the page also streams play/seek/percent
--   events to /api/track/video-event for our own real-time analytics.

-- Per-brand video lander config
alter table brands add column if not exists wistia_media_id text;         -- e.g. 'abc123xyz'
alter table brands add column if not exists watch_headline  text;
alter table brands add column if not exists watch_subtitle  text;

-- First-party video engagement events (Wistia's own stats remain in Wistia,
-- keyed by the same email; this table powers our real-time dashboard view).
create table if not exists video_events (
  id          uuid        primary key default gen_random_uuid(),
  email       text,                        -- lead email when known
  lead_id     text,                        -- leads.token, when arriving via prefill redirect
  brand_slug  text,
  media_id    text        not null,        -- Wistia hashed media id
  session_id  text        not null,        -- per-pageview id so multiple watches are distinguishable
  event_type  text        not null,        -- video_page_viewed | play | pause | seek | percent_watched | end
  event_data  jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists idx_video_events_email      on video_events(email) where email is not null;
create index if not exists idx_video_events_lead_id    on video_events(lead_id) where lead_id is not null;
create index if not exists idx_video_events_session    on video_events(session_id);
create index if not exists idx_video_events_created_at on video_events(created_at desc);
