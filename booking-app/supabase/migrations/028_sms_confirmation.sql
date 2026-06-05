-- Migration 028: SMS confirmation status on bookings
-- Stores the result of querying the GHL conversation for appointment confirmation.
-- Values: 'confirmed' | 'declined' | 'uncertain' | 'no_response'
-- Cached so we don't hammer GHL on every page load.

alter table bookings
  add column if not exists sms_confirmation      text        default null
    check (sms_confirmation in ('confirmed','declined','uncertain','no_response')),
  add column if not exists sms_confirmation_at   timestamptz default null,
  add column if not exists sms_confirmation_note text        default null; -- snippet of the deciding message
