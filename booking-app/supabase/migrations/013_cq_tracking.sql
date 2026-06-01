-- Migration 013: CQ tracking columns on bookings
-- Run: supabase db push  (or paste in Supabase SQL editor)

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cq_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cq_received_at TIMESTAMPTZ;

-- Back-fill cq_sent_at from lead_events for any bookings that already had Send CQ clicked
UPDATE bookings b
SET cq_sent_at = (
  SELECT MIN(le.created_at)
  FROM lead_events le
  WHERE le.email = b.email
    AND le.event_type = 'cq_email_sent'
)
WHERE cq_sent_at IS NULL;
