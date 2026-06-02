-- Migration 017: In-Process Nurture tables
-- nurture_clients, nurture_touchpoints, nurture_brands

CREATE TABLE IF NOT EXISTS nurture_clients (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id    UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  lead_id       UUID        REFERENCES leads(id)    ON DELETE SET NULL,
  email         TEXT        NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  phone         TEXT,
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'closed', 'archived')),
  funding_intro_done BOOLEAN NOT NULL DEFAULT FALSE,
  last_contacted_at  TIMESTAMPTZ,
  entered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nurture_touchpoints (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nurture_client_id UUID        NOT NULL REFERENCES nurture_clients(id) ON DELETE CASCADE,
  medium            TEXT        NOT NULL CHECK (medium IN ('call', 'email', 'text')),
  note              TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nurture_brands (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nurture_client_id UUID        NOT NULL REFERENCES nurture_clients(id) ON DELETE CASCADE,
  brand_name        TEXT        NOT NULL,
  stage             INT         NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 5),
  sentiment         TEXT        CHECK (sentiment IN ('positive', 'neutral', 'concerns', 'passed')),
  note              TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nurture_client_id, brand_name)
);

CREATE INDEX IF NOT EXISTS nurture_clients_email_idx  ON nurture_clients(email);
CREATE INDEX IF NOT EXISTS nurture_clients_status_idx ON nurture_clients(status);
CREATE INDEX IF NOT EXISTS nurture_tp_client_idx      ON nurture_touchpoints(nurture_client_id);
CREATE INDEX IF NOT EXISTS nurture_brands_client_idx  ON nurture_brands(nurture_client_id);
