-- Migration 033: DealOS — evolve nurture_brands into the deal/opportunity entity,
-- add granular deal events, and split touchpoints by party (candidate vs developer).
--
-- Design notes:
--  * nurture_clients stays the candidate; nurture_brands becomes the deal.
--  * The legacy stage INT (1-5) column is kept for back-compat but is no longer
--    the controlling business logic; deal_status is.
--  * Funding/attorney introductions are checkpoints (events + milestones JSONB),
--    not sequential stages.

-- ── Deal fields on nurture_brands ─────────────────────────────────────────────
ALTER TABLE nurture_brands
  ADD COLUMN IF NOT EXISTS deal_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS estimated_commission NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_candidate_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_developer_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS developer_sentiment TEXT,
  ADD COLUMN IF NOT EXISTS next_action_type TEXT,
  ADD COLUMN IF NOT EXISTS next_action_note TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waiting_on TEXT,
  ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waiting_note TEXT,
  ADD COLUMN IF NOT EXISTS next_event_type TEXT,
  ADD COLUMN IF NOT EXISTS next_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stalled_reason TEXT,
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Universal deal statuses. 'new' = CQ received, not yet submitted to franchisor.
ALTER TABLE nurture_brands DROP CONSTRAINT IF EXISTS nurture_brands_deal_status_check;
ALTER TABLE nurture_brands
  ADD CONSTRAINT nurture_brands_deal_status_check CHECK (deal_status IN
    ('new','submitted','connected','due_diligence','final_evaluation','decision','signed','paid','closed'));

ALTER TABLE nurture_brands DROP CONSTRAINT IF EXISTS nurture_brands_developer_sentiment_check;
ALTER TABLE nurture_brands
  ADD CONSTRAINT nurture_brands_developer_sentiment_check CHECK
    (developer_sentiment IS NULL OR developer_sentiment IN ('positive','neutral','concerns','passed'));

ALTER TABLE nurture_brands DROP CONSTRAINT IF EXISTS nurture_brands_next_action_type_check;
ALTER TABLE nurture_brands
  ADD CONSTRAINT nurture_brands_next_action_type_check CHECK
    (next_action_type IS NULL OR next_action_type IN ('call','text','email','meeting','task'));

ALTER TABLE nurture_brands DROP CONSTRAINT IF EXISTS nurture_brands_waiting_on_check;
ALTER TABLE nurture_brands
  ADD CONSTRAINT nurture_brands_waiting_on_check CHECK
    (waiting_on IS NULL OR waiting_on IN ('candidate','developer','franchisor','funding','attorney','other'));

ALTER TABLE nurture_brands DROP CONSTRAINT IF EXISTS nurture_brands_outcome_check;
ALTER TABLE nurture_brands
  ADD CONSTRAINT nurture_brands_outcome_check CHECK
    (outcome IS NULL OR outcome IN ('won','lost','withdrawn'));

-- Backfill deal_status from the legacy 1-5 stage for pre-existing deals.
-- Existing deals were live in the old flow, so stage 1 maps to 'submitted'
-- (they had already been submitted / were in intro calls), not 'new'.
UPDATE nurture_brands SET deal_status = CASE stage
    WHEN 1 THEN 'submitted'
    WHEN 2 THEN 'connected'
    WHEN 3 THEN 'due_diligence'
    WHEN 4 THEN 'final_evaluation'
    WHEN 5 THEN 'decision'
    ELSE 'submitted'
  END
WHERE deal_status = 'new';

-- Deals with developer contact info on file were connected in practice.
UPDATE nurture_brands SET connected_at = COALESCE(connected_at, updated_at)
  WHERE deal_status NOT IN ('new','submitted') AND connected_at IS NULL;

-- ── Granular per-deal events / milestones ─────────────────────────────────────
-- Different franchisors run different processes; events model that flexibly.
CREATE TABLE IF NOT EXISTS nurture_deal_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id       UUID NOT NULL REFERENCES nurture_brands(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN
    ('intro_call','unit_economics','fdd_review','validation','discovery_day',
     'confirmation_day','funding_intro','attorney_intro','award','agreement_sent',
     'signing','other')),
  title         TEXT,
  scheduled_at  TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  debrief_done  BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nurture_deal_events_deal_idx ON nurture_deal_events(deal_id);
CREATE INDEX IF NOT EXISTS nurture_deal_events_sched_idx ON nurture_deal_events(scheduled_at);

-- ── Touchpoints: deal linkage + candidate/developer split ─────────────────────
ALTER TABLE nurture_touchpoints
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES nurture_brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS party TEXT NOT NULL DEFAULT 'candidate';

ALTER TABLE nurture_touchpoints DROP CONSTRAINT IF EXISTS nurture_touchpoints_party_check;
ALTER TABLE nurture_touchpoints
  ADD CONSTRAINT nurture_touchpoints_party_check CHECK (party IN ('candidate','developer'));

-- Widen medium to include notes and meetings (the UI already tried to log notes;
-- the old CHECK rejected them silently).
ALTER TABLE nurture_touchpoints DROP CONSTRAINT IF EXISTS nurture_touchpoints_medium_check;
ALTER TABLE nurture_touchpoints
  ADD CONSTRAINT nurture_touchpoints_medium_check CHECK
    (medium IN ('call','email','text','note','meeting'));

CREATE INDEX IF NOT EXISTS nurture_tp_deal_idx ON nurture_touchpoints(deal_id);

-- Seed per-deal candidate contact from the client-level timestamp so overdue
-- rules don't fire on day one for every migrated deal.
UPDATE nurture_brands b
SET last_candidate_contact_at = c.last_contacted_at
FROM nurture_clients c
WHERE b.nurture_client_id = c.id
  AND b.last_candidate_contact_at IS NULL
  AND c.last_contacted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS nurture_brands_deal_status_idx ON nurture_brands(deal_status);
CREATE INDEX IF NOT EXISTS nurture_brands_next_action_due_idx ON nurture_brands(next_action_due_at);
