-- Deal Desk workflow facts and developer contact details.
-- This migration extends 033/034; it does not copy or alter Nurture/DealOS records.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS developer_phone TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS cq_received_at TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS introduction_at TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_successful_conversation_at TIMESTAMPTZ;
ALTER TABLE deals ALTER COLUMN stage SET DEFAULT 'cq_received';
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check CHECK (stage IN ('cq_received','submitted','brand_contact','education','validation','discovery_day','decision','closed'));

-- Replace only the transactional routines whose payloads need the new fields.
CREATE OR REPLACE FUNCTION create_deal_with_followup(p_deal JSONB, p_followup JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d deals; f deal_followups;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_followup->>'request_key', 0));
  SELECT * INTO f FROM deal_followups WHERE request_key=(p_followup->>'request_key')::uuid LIMIT 1;
  IF FOUND THEN
    SELECT * INTO d FROM deals WHERE id=f.deal_id;
    IF lower(d.email)<>lower(p_deal->>'email') OR lower(d.brand)<>lower(trim(p_deal->>'brand')) THEN RAISE EXCEPTION 'Idempotency key already belongs to another deal'; END IF;
    RETURN jsonb_build_object('deal',to_jsonb(d),'followup',to_jsonb(f),'retried',true);
  END IF;
  INSERT INTO deals (lead_id,email,phone,first_name,last_name,brand,stage,assigned_to_email,developer_name,developer_email,developer_phone,units,estimated_deal_value,current_blocker,cq_received_at,submitted_at,introduction_at)
  VALUES ((p_deal->>'lead_id')::uuid,lower(p_deal->>'email'),p_deal->>'phone',p_deal->>'first_name',p_deal->>'last_name',trim(p_deal->>'brand'),COALESCE(p_deal->>'stage','cq_received'),lower(p_deal->>'assigned_to_email'),p_deal->>'developer_name',p_deal->>'developer_email',p_deal->>'developer_phone',p_deal->>'units',NULLIF(p_deal->>'estimated_deal_value','')::numeric,p_deal->>'current_blocker',(p_deal->>'cq_received_at')::timestamptz,(p_deal->>'submitted_at')::timestamptz,(p_deal->>'introduction_at')::timestamptz) RETURNING * INTO d;
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
  UPDATE deals SET last_touch_at=now(),last_successful_conversation_at=CASE WHEN p_outcome='connected' THEN now() ELSE last_successful_conversation_at END,stage=COALESCE(mapped_stage,stage),updated_at=now() WHERE id=f.deal_id AND status='active';
  RETURN jsonb_build_object('followup',to_jsonb(f),'next',to_jsonb(n));
END $$;

REVOKE ALL ON FUNCTION create_deal_with_followup(JSONB,JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_deal_followup(UUID,UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_deal_with_followup(JSONB,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION complete_deal_followup(UUID,UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO service_role;
