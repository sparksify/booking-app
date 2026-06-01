-- Migration 015: Revenue Attribution
-- Tracks closed deals with full advisor + bucket attribution

CREATE TABLE IF NOT EXISTS closings (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id          UUID         REFERENCES leads(id) ON DELETE CASCADE,
  booking_id       UUID         REFERENCES bookings(id) ON DELETE SET NULL,
  advisor_email    TEXT,
  bucket           TEXT,           -- which opportunity bucket the lead was in when closed
  franchise_brand  TEXT,
  commission       NUMERIC(12, 2) NOT NULL,
  closed_at        TIMESTAMPTZ  DEFAULT NOW(),
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS closings_lead_id_idx     ON closings(lead_id);
CREATE INDEX IF NOT EXISTS closings_advisor_email_idx ON closings(advisor_email);
CREATE INDEX IF NOT EXISTS closings_closed_at_idx   ON closings(closed_at DESC);
