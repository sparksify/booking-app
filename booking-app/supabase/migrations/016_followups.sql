-- Migration 016: followups table
-- Stores scheduled follow-up reminders with date, note, and temperature (likelihood to engage)

CREATE TABLE IF NOT EXISTS followups (
  id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id     UUID         REFERENCES bookings(id) ON DELETE SET NULL,
  lead_id        UUID         REFERENCES leads(id)    ON DELETE SET NULL,
  email          TEXT         NOT NULL,
  follow_up_date DATE         NOT NULL,
  note           TEXT,
  temperature    INT          CHECK (temperature BETWEEN 1 AND 5),
  created_by     TEXT,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS followups_email_idx          ON followups(email);
CREATE INDEX IF NOT EXISTS followups_follow_up_date_idx ON followups(follow_up_date);
CREATE INDEX IF NOT EXISTS followups_booking_id_idx     ON followups(booking_id);
