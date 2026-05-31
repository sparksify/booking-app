-- Migration 011: Attribution Engine — lead event stream + booking source

-- Per-lead event timeline (keyed by email so it works for all leads, not just Facebook ones)
CREATE TABLE IF NOT EXISTS lead_events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT        NOT NULL,
  lead_id     TEXT,                                                  -- Facebook lead token, if applicable
  booking_id  UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  event_type  TEXT        NOT NULL,
  event_data  JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_events_email      ON lead_events(email);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id    ON lead_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_events_booking_id ON lead_events(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at ON lead_events(created_at DESC);

-- Booking source: last meaningful touchpoint that caused the booking
-- Values: 'direct' | 'facebook_lead' | 'closebot' | 'sms' | 'email' | 'retargeting'
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_source TEXT;
