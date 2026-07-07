-- Manual "quick add call" entries (Meetings dashboard → "Add Call") may capture
-- only a phone number, with no email. The bookings read/dedup path already
-- tolerates null emails, so relax the NOT NULL constraint to allow phone-only
-- manual calls.
ALTER TABLE public.bookings ALTER COLUMN email DROP NOT NULL;
