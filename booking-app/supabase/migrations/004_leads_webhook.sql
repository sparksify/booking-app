-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Leads table — Facebook webhook + token-based booking
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. leads table — one row per Facebook Lead Ad submission
CREATE TABLE IF NOT EXISTS leads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token            text        UNIQUE NOT NULL,          -- short token for booking URL
  fb_lead_id       text        UNIQUE,                   -- Facebook leadgen_id
  fb_form_id       text,                                 -- which form they filled out
  fb_page_id       text,
  fb_ad_id         text,
  fb_adset_id      text,
  fb_campaign_id   text,

  -- Core contact fields (copied out of raw_fields for easy querying)
  first_name       text,
  last_name        text,
  email            text,
  phone            text,
  investment_level text,

  -- Every field the lead answered, keyed by Facebook field name
  raw_fields       jsonb       NOT NULL DEFAULT '{}',

  -- Status: new → booked → showed | no_show | qualified | lost
  status           text        NOT NULL DEFAULT 'new',

  -- GHL contact ID once synced
  ghl_contact_id   text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. Link bookings back to the lead that created them
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_leads_token       ON leads(token);
CREATE INDEX IF NOT EXISTS idx_leads_fb_lead_id  ON leads(fb_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_email       ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at  ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_lead_id  ON bookings(lead_id);
