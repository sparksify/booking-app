-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Events table — booking funnel & conversion tracking
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened
  event_type    text        NOT NULL,
  -- Values: page_view | recommended_shown | recommended_accepted |
  --         recommended_rejected | calendar_opened | slot_selected |
  --         booking_completed | calendar_add_clicked | booking_abandoned

  -- Session linking (random ID set on first page load, stored in sessionStorage)
  session_id    text,

  -- Links to other tables
  lead_id       uuid        REFERENCES leads(id)    ON DELETE SET NULL,
  booking_id    uuid        REFERENCES bookings(id) ON DELETE SET NULL,

  -- Arbitrary event payload (slot info, source, etc.)
  props         jsonb       NOT NULL DEFAULT '{}',

  -- FB attribution (denormalized from lead for fast querying)
  fb_campaign_id  text,
  fb_adset_id     text,
  fb_ad_id        text,
  fb_form_id      text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_events_event_type  ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_session_id  ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_lead_id     ON events(lead_id);
CREATE INDEX IF NOT EXISTS idx_events_booking_id  ON events(booking_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at  ON events(created_at DESC);
