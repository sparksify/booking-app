-- Deal Desk reliability/lifecycle additions. Safe whether 033 was recently applied or already live.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS current_blocker TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS close_reason TEXT;
ALTER TABLE deal_followups ADD COLUMN IF NOT EXISTS contact_target TEXT NOT NULL DEFAULT 'candidate';
ALTER TABLE deal_followups ADD COLUMN IF NOT EXISTS request_key UUID;
ALTER TABLE deal_followups ADD COLUMN IF NOT EXISTS outcome_note TEXT;

DO $$ BEGIN
  ALTER TABLE deal_followups ADD CONSTRAINT deal_followups_contact_target_check CHECK (contact_target IN ('candidate','developer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS deal_followups_request_key_idx ON deal_followups(request_key) WHERE request_key IS NOT NULL;

-- Preserve accidental duplicate reminders as cancelled history, then enforce one
-- pending next action for each deal at the database layer.
WITH ranked_pending AS (
  SELECT id, row_number() OVER (PARTITION BY deal_id ORDER BY due_at, created_at, id) AS position
  FROM deal_followups
  WHERE status = 'pending'
)
UPDATE deal_followups
SET status = 'cancelled', updated_at = now()
WHERE id IN (SELECT id FROM ranked_pending WHERE position > 1);
CREATE UNIQUE INDEX IF NOT EXISTS deal_followups_one_pending_per_deal_idx
  ON deal_followups(deal_id) WHERE status = 'pending';

-- Repair any legacy active rows created before next-action enforcement existed.
INSERT INTO deal_followups (deal_id, assigned_to_email, due_at, note, contact_target)
SELECT d.id, d.assigned_to_email, now() + interval '1 day', 'Review and schedule next franchise action', 'candidate'
FROM deals d
WHERE d.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM deal_followups f WHERE f.deal_id = d.id AND f.status = 'pending');

-- Each function invocation is one PostgreSQL transaction. Idempotency keys make browser retries safe.
CREATE OR REPLACE FUNCTION create_deal_with_followup(p_deal JSONB, p_followup JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d deals; f deal_followups;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_followup->>'request_key', 0));
  SELECT df.* INTO f FROM deal_followups df WHERE df.request_key=(p_followup->>'request_key')::uuid LIMIT 1;
  IF FOUND THEN
    SELECT * INTO d FROM deals WHERE id=f.deal_id;
    IF lower(d.email)<>lower(p_deal->>'email') OR lower(d.brand)<>lower(trim(p_deal->>'brand')) THEN RAISE EXCEPTION 'Idempotency key already belongs to another deal'; END IF;
    RETURN jsonb_build_object('deal',to_jsonb(d),'followup',to_jsonb(f),'retried',true);
  END IF;
  INSERT INTO deals (lead_id,email,phone,first_name,last_name,brand,assigned_to_email,developer_name,developer_email,units,estimated_deal_value,current_blocker)
  VALUES ((p_deal->>'lead_id')::uuid,lower(p_deal->>'email'),p_deal->>'phone',p_deal->>'first_name',p_deal->>'last_name',trim(p_deal->>'brand'),lower(p_deal->>'assigned_to_email'),p_deal->>'developer_name',p_deal->>'developer_email',p_deal->>'units',NULLIF(p_deal->>'estimated_deal_value','')::numeric,p_deal->>'current_blocker') RETURNING * INTO d;
  INSERT INTO deal_followups (deal_id,assigned_to_email,due_at,action_type,note,contact_target,request_key)
  VALUES (d.id,d.assigned_to_email,(p_followup->>'due_at')::timestamptz,COALESCE(p_followup->>'action_type','follow_up'),p_followup->>'note',COALESCE(p_followup->>'contact_target','candidate'),(p_followup->>'request_key')::uuid) RETURNING * INTO f;
  RETURN jsonb_build_object('deal',to_jsonb(d),'followup',to_jsonb(f));
END $$;

CREATE OR REPLACE FUNCTION complete_deal_followup(p_followup_id UUID,p_request_key UUID,p_outcome TEXT,p_note TEXT,p_next_note TEXT,p_next_due_at TIMESTAMPTZ,p_contact_target TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f deal_followups; n deal_followups; d deals; mapped_stage TEXT;
BEGIN
  SELECT * INTO f FROM deal_followups WHERE id=p_followup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Follow-up not found'; END IF;
  IF f.status='completed' THEN
    SELECT * INTO n FROM deal_followups WHERE deal_id=f.deal_id AND request_key=p_request_key;
    IF NOT FOUND THEN SELECT * INTO n FROM deal_followups WHERE deal_id=f.deal_id AND status='pending' ORDER BY created_at DESC LIMIT 1; END IF;
    RETURN jsonb_build_object('followup',to_jsonb(f),'next',to_jsonb(n),'retried',true);
  END IF;
  IF f.status<>'pending' THEN RAISE EXCEPTION 'Follow-up is not pending'; END IF;
  SELECT * INTO d FROM deals WHERE id=f.deal_id FOR UPDATE;
  IF d.status<>'active' THEN RAISE EXCEPTION 'Only active deals can schedule another follow-up'; END IF;
  IF p_next_due_at IS NULL OR p_next_due_at<=now() THEN RAISE EXCEPTION 'A future next action is required'; END IF;
  UPDATE deal_followups SET status='completed',completed_at=now(),outcome=p_outcome,outcome_note=p_note,updated_at=now() WHERE id=f.id RETURNING * INTO f;
  INSERT INTO deal_followups(deal_id,assigned_to_email,due_at,note,contact_target,request_key) VALUES(f.deal_id,f.assigned_to_email,p_next_due_at,p_next_note,COALESCE(p_contact_target,'candidate'),p_request_key) RETURNING * INTO n;
  mapped_stage:=CASE p_outcome WHEN 'waiting_on_developer' THEN 'brand_contact' WHEN 'validation_scheduled' THEN 'validation' WHEN 'discovery_day_scheduled' THEN 'discovery_day' WHEN 'decision_pending' THEN 'decision' ELSE NULL END;
  UPDATE deals SET last_touch_at=now(),stage=COALESCE(mapped_stage,stage),updated_at=now() WHERE id=f.deal_id AND status='active';
  RETURN jsonb_build_object('followup',to_jsonb(f),'next',to_jsonb(n));
END $$;

CREATE OR REPLACE FUNCTION change_deal_lifecycle(p_deal_id UUID,p_status TEXT,p_reason TEXT,p_due_at TIMESTAMPTZ,p_request_key UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d deals; n deal_followups;
BEGIN
  IF p_status NOT IN ('active','won','lost','paused') THEN RAISE EXCEPTION 'Invalid deal status'; END IF;
  SELECT * INTO d FROM deals WHERE id=p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deal not found'; END IF;
  IF d.status=p_status AND p_status<>'active' THEN RETURN jsonb_build_object('deal',to_jsonb(d),'retried',true); END IF;
  IF p_status='active' THEN
    SELECT * INTO n FROM deal_followups WHERE deal_id=d.id AND request_key=p_request_key LIMIT 1;
    IF FOUND AND d.status='active' THEN RETURN jsonb_build_object('deal',to_jsonb(d),'next',to_jsonb(n),'retried',true); END IF;
    IF d.status<>'paused' THEN RAISE EXCEPTION 'Only paused deals can be resumed'; END IF;
    IF p_due_at IS NULL OR p_due_at<=now() THEN RAISE EXCEPTION 'Resuming requires a future next action'; END IF;
    IF EXISTS (SELECT 1 FROM deal_followups WHERE deal_id=d.id AND status='pending') THEN RAISE EXCEPTION 'Deal already has a pending next action'; END IF;
    INSERT INTO deal_followups(deal_id,assigned_to_email,due_at,note,request_key) VALUES(d.id,d.assigned_to_email,p_due_at,'Resume deal follow-up',p_request_key) ON CONFLICT(request_key) WHERE request_key IS NOT NULL DO UPDATE SET request_key=EXCLUDED.request_key RETURNING * INTO n;
    IF n.deal_id<>d.id THEN RAISE EXCEPTION 'Idempotency key already belongs to another deal'; END IF;
  ELSE
    IF d.status<>'active' THEN RAISE EXCEPTION 'Only active deals can be won, lost, or paused'; END IF;
    UPDATE deal_followups SET status='cancelled',updated_at=now() WHERE deal_id=d.id AND status='pending';
  END IF;
  UPDATE deals SET status=p_status,close_reason=NULLIF(p_reason,''),closed_at=CASE WHEN p_status IN ('won','lost') THEN now() ELSE NULL END,stage=CASE WHEN p_status IN ('won','lost') THEN 'closed' ELSE stage END,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  RETURN jsonb_build_object('deal',to_jsonb(d),'next',to_jsonb(n));
END $$;

REVOKE ALL ON TABLE deals, deal_followups FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deals, deal_followups TO service_role;
REVOKE ALL ON FUNCTION create_deal_with_followup(JSONB,JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_deal_followup(UUID,UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION change_deal_lifecycle(UUID,TEXT,TEXT,TIMESTAMPTZ,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_deal_with_followup(JSONB,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION complete_deal_followup(UUID,UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION change_deal_lifecycle(UUID,TEXT,TEXT,TIMESTAMPTZ,UUID) TO service_role;
