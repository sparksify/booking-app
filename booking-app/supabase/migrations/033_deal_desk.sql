-- Lightweight Deal Desk: a durable deal record plus an append-only history of actions.
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  brand TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'submitted' CHECK (stage IN ('submitted','brand_contact','education','validation','discovery_day','decision','closed')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','lost','paused')),
  assigned_to_email TEXT NOT NULL,
  developer_name TEXT,
  developer_email TEXT,
  units TEXT,
  estimated_deal_value NUMERIC(12,2),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_touch_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS deal_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  assigned_to_email TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'follow_up',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  completed_at TIMESTAMPTZ,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS deals_one_active_email_brand_idx
  ON deals (LOWER(email), LOWER(brand)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS deals_assignee_status_idx ON deals (assigned_to_email, status);
CREATE INDEX IF NOT EXISTS deal_followups_pending_due_idx ON deal_followups (due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS deal_followups_assignee_idx ON deal_followups (assigned_to_email, status, due_at);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_followups ENABLE ROW LEVEL SECURITY;
-- These records are intentionally accessed through authenticated server API routes
-- using the service role; no browser/anon policies are granted.
