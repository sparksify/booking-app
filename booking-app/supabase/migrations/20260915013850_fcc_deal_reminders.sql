-- Additive, opt-in FCC evidence and system obligations. Does not alter DealOS or
-- the one-pending-deal_followups invariant. All access is through scoped APIs.
CREATE TABLE public.fcc_mailboxes (
  owner_email text PRIMARY KEY CHECK (owner_email = lower(owner_email)),
  mailbox_email text NOT NULL UNIQUE,
  tokens_encrypted text NOT NULL,
  activation_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  check_hour integer NOT NULL DEFAULT 9 CHECK (check_hour BETWEEN 0 AND 23),
  synced_through timestamptz,
  scan_until timestamptz,
  page_token text,
  last_error text,
  lease_until timestamptz,
  lease_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fcc_brand_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL REFERENCES public.fcc_mailboxes(owner_email),
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  aliases text[] NOT NULL DEFAULT '{}',
  verified_emails text[] NOT NULL DEFAULT '{}',
  verified_domains text[] NOT NULL DEFAULT '{}',
  UNIQUE(owner_email, brand_id)
);
CREATE TABLE public.fcc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL REFERENCES public.fcc_mailboxes(owner_email),
  deal_id uuid REFERENCES public.deals(id),
  brand_id uuid REFERENCES public.brands(id),
  brand_label text NOT NULL,
  candidate_email text NOT NULL,
  candidate_name text NOT NULL,
  candidate_phone text,
  territories text,
  source_message_id text NOT NULL,
  source_thread_id text NOT NULL,
  fingerprint text NOT NULL,
  submitted_at timestamptz NOT NULL,
  timestamp_source text NOT NULL CHECK (timestamp_source IN ('receipt','email_received')),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','review','dismissed')),
  review_reason text,
  acknowledgment_needs_review boolean NOT NULL DEFAULT false,
  checked_through timestamptz,
  check_page_token text,
  check_until timestamptz,
  check_error text,
  acknowledged_at timestamptz,
  outreach_planned_at timestamptz,
  contact_reported_at timestamptz,
  candidate_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_email, source_message_id, brand_label),
  UNIQUE(owner_email, candidate_email, brand_label, fingerprint)
);
CREATE INDEX fcc_submissions_owner_due ON public.fcc_submissions(owner_email, due_at) WHERE status='pending';
CREATE INDEX fcc_submissions_deal ON public.fcc_submissions(deal_id);
CREATE INDEX fcc_submissions_brand ON public.fcc_submissions(brand_id);
CREATE UNIQUE INDEX fcc_submissions_canonical_source ON public.fcc_submissions(owner_email,source_message_id,brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX fcc_brand_rules_brand ON public.fcc_brand_rules(brand_id);
CREATE TABLE public.fcc_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.fcc_submissions(id),
  event_key text NOT NULL,
  classification text NOT NULL,
  occurred_at timestamptz NOT NULL,
  next_due_at timestamptz,
  source_message_id text,
  excerpt text CHECK (length(excerpt) <= 500),
  manual boolean NOT NULL DEFAULT false,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id, event_key)
);
ALTER TABLE public.fcc_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcc_brand_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcc_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fcc_mailboxes, public.fcc_brand_rules, public.fcc_submissions, public.fcc_evidence FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fcc_mailboxes, public.fcc_brand_rules, public.fcc_submissions, public.fcc_evidence TO service_role;

-- Invoker rights; only the server service role can call these functions.
CREATE FUNCTION public.fcc_ingest(p_owner text, p_receipt jsonb, p_brand uuid, p_aliases text[], p_review text DEFAULT NULL, p_review_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s fcc_submissions; d deals; canonical text; matches integer; why text := p_review;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fcc_mailboxes WHERE owner_email=p_owner) THEN RAISE EXCEPTION 'Mailbox not connected'; END IF;
  SELECT name INTO canonical FROM brands WHERE id=p_brand AND active=true;
  IF canonical IS NULL THEN why := coalesce(why,'Brand needs review'); END IF;
  -- Global lock agrees with Deal Desk's global active candidate/brand uniqueness.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(p_receipt->>'email') || ':' || lower(coalesce(canonical,p_receipt->>'brand')), 0));
  IF p_review_id IS NOT NULL THEN
    SELECT * INTO s FROM fcc_submissions WHERE id=p_review_id AND owner_email=p_owner FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
    IF s.status<>'review' THEN RETURN to_jsonb(s); END IF;
  ELSE
    SELECT * INTO s FROM fcc_submissions WHERE owner_email=p_owner AND
      ((source_message_id=p_receipt->>'message_id' AND (brand_label=p_receipt->>'brand' OR brand_id=p_brand)) OR
       (candidate_email=lower(p_receipt->>'email') AND (brand_label=p_receipt->>'brand' OR brand_id=p_brand) AND fingerprint=p_receipt->>'fingerprint')) LIMIT 1;
    IF FOUND THEN RETURN to_jsonb(s); END IF;
  END IF;
  IF p_brand IS NOT NULL AND NOT lower(canonical)=ANY(p_aliases) THEN RAISE EXCEPTION 'Canonical brand missing from aliases'; END IF;
  IF why IS NULL THEN
    SELECT count(*) INTO matches FROM deals WHERE lower(email)=lower(p_receipt->>'email') AND
      lower(trim(brand))=ANY(p_aliases);
    IF matches>1 THEN why := 'Multiple candidate/brand deals need review';
    ELSIF matches=1 THEN
      SELECT * INTO d FROM deals WHERE lower(email)=lower(p_receipt->>'email') AND lower(trim(brand))=ANY(p_aliases) FOR UPDATE;
      IF lower(d.assigned_to_email)<>p_owner THEN why := 'Deal belongs to another consultant';
      ELSIF d.status<>'active' THEN why := 'Existing deal is ' || d.status || '; no reminders created'; END IF;
    END IF;
  END IF;
  IF why IS NULL THEN
    IF d.id IS NULL THEN
      INSERT INTO deals(email,first_name,last_name,phone,brand,assigned_to_email,stage,units,submitted_at)
      VALUES(lower(p_receipt->>'email'),split_part(p_receipt->>'name',' ',1),
        trim(substr(p_receipt->>'name',length(split_part(p_receipt->>'name',' ',1))+1)),p_receipt->>'phone',canonical,p_owner,'submitted',p_receipt->>'territories',(p_receipt->>'submitted_at')::timestamptz) RETURNING * INTO d;
      INSERT INTO deal_followups(deal_id,assigned_to_email,due_at,note,contact_target,request_key)
      VALUES(d.id,p_owner,(p_receipt->>'due_at')::timestamptz,'Check in with candidate after brand submission','candidate',gen_random_uuid());
    ELSE
      UPDATE deals SET submitted_at=coalesce(submitted_at,(p_receipt->>'submitted_at')::timestamptz),
        stage=CASE WHEN stage='cq_received' THEN 'submitted' ELSE stage END, updated_at=now() WHERE id=d.id;
    END IF;
  END IF;
  IF s.id IS NULL THEN
    INSERT INTO fcc_submissions(owner_email,deal_id,brand_id,brand_label,candidate_email,candidate_name,candidate_phone,territories,
      source_message_id,source_thread_id,fingerprint,submitted_at,timestamp_source,due_at,status,review_reason)
    VALUES(p_owner,CASE WHEN why IS NULL THEN d.id END,p_brand,p_receipt->>'brand',lower(p_receipt->>'email'),p_receipt->>'name',p_receipt->>'phone',p_receipt->>'territories',
      p_receipt->>'message_id',p_receipt->>'thread_id',p_receipt->>'fingerprint',(p_receipt->>'submitted_at')::timestamptz,p_receipt->>'timestamp_source',
      (p_receipt->>'due_at')::timestamptz,CASE WHEN why IS NULL THEN 'pending' ELSE 'review' END,why) RETURNING * INTO s;
  ELSE
    UPDATE fcc_submissions SET deal_id=CASE WHEN why IS NULL THEN d.id END,brand_id=p_brand,
      status=CASE WHEN why IS NULL THEN 'pending' ELSE 'review' END,review_reason=why WHERE id=s.id RETURNING * INTO s;
  END IF;
  INSERT INTO fcc_evidence(submission_id,event_key,classification,occurred_at,source_message_id,manual,actor_email)
    VALUES(s.id,CASE WHEN p_review_id IS NULL THEN 'submission' ELSE 'review:' || p_brand::text END,
      CASE WHEN why IS NULL THEN 'submitted' ELSE 'needs_review' END,s.submitted_at,s.source_message_id,p_review_id IS NOT NULL,p_owner)
    ON CONFLICT DO NOTHING;
  RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.fcc_record_action(p_owner text,p_id uuid,p_key text,p_action text,p_at timestamptz,p_next timestamptz,p_excerpt text,p_message text,p_manual boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s fcc_submissions; d deals;
BEGIN
  SELECT * INTO s FROM fcc_submissions WHERE id=p_id AND owner_email=p_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
  IF EXISTS(SELECT 1 FROM fcc_evidence WHERE submission_id=s.id AND event_key=p_key) THEN
    IF p_manual AND EXISTS(SELECT 1 FROM fcc_evidence WHERE submission_id=s.id AND event_key=p_key AND
      (classification<>p_action OR next_due_at IS DISTINCT FROM p_next OR excerpt IS DISTINCT FROM left(p_excerpt,500))) THEN
      RAISE EXCEPTION 'This request was already saved with different details. Reload before making another change';
    END IF;
    RETURN to_jsonb(s);
  END IF;
  IF p_action NOT IN ('acknowledged','outreach_planned','contact_reported','candidate_confirmed','attempt','snooze','needs_review','dismissed','reopen') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  IF s.deal_id IS NOT NULL THEN
    SELECT * INTO d FROM deals WHERE id=s.deal_id FOR UPDATE;
    IF lower(d.assigned_to_email)<>p_owner THEN RAISE EXCEPTION 'Deal ownership changed'; END IF;
    IF d.status<>'active' AND p_action IN ('attempt','snooze','reopen') THEN RAISE EXCEPTION 'Deal is not active'; END IF;
  END IF;
  IF p_action IN ('attempt','snooze','reopen') AND (p_next IS NULL OR p_next<=now()) THEN RAISE EXCEPTION 'A future reminder date is required'; END IF;
  IF p_action IN ('attempt','snooze') AND s.status<>'pending' THEN RETURN to_jsonb(s); END IF;
  IF p_action='reopen' AND (NOT p_manual OR s.deal_id IS NULL) THEN RAISE EXCEPTION 'Manual correction requires a linked deal'; END IF;
  INSERT INTO fcc_evidence(submission_id,event_key,classification,occurred_at,next_due_at,source_message_id,excerpt,manual,actor_email)
    VALUES(s.id,p_key,p_action,p_at,p_next,p_message,left(p_excerpt,500),p_manual,p_owner);
  UPDATE fcc_submissions SET
    acknowledgment_needs_review=CASE WHEN p_action='needs_review' AND status='pending' THEN true WHEN p_action IN ('acknowledged','outreach_planned','contact_reported','dismissed','reopen') THEN false ELSE acknowledgment_needs_review END,
    status=CASE WHEN p_action IN ('acknowledged','outreach_planned','contact_reported') THEN 'acknowledged' WHEN p_action='dismissed' THEN 'dismissed' WHEN p_action='reopen' THEN 'pending' ELSE status END,
    acknowledged_at=CASE WHEN p_action='reopen' THEN NULL WHEN p_action IN ('acknowledged','outreach_planned','contact_reported') THEN coalesce(acknowledged_at,p_at) ELSE acknowledged_at END,
    outreach_planned_at=CASE WHEN p_action='outreach_planned' THEN coalesce(outreach_planned_at,p_at) ELSE outreach_planned_at END,
    contact_reported_at=CASE WHEN p_action='contact_reported' THEN coalesce(contact_reported_at,p_at) ELSE contact_reported_at END,
    candidate_confirmed_at=CASE WHEN p_action='candidate_confirmed' THEN coalesce(candidate_confirmed_at,p_at) ELSE candidate_confirmed_at END,
    due_at=CASE WHEN p_action IN ('attempt','snooze','reopen') THEN p_next ELSE due_at END
    WHERE id=s.id RETURNING * INTO s;
  RETURN to_jsonb(s);
END $$;
REVOKE ALL ON FUNCTION public.fcc_ingest(text,jsonb,uuid,text[],text,uuid), public.fcc_record_action(text,uuid,text,text,timestamptz,timestamptz,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fcc_ingest(text,jsonb,uuid,text[],text,uuid), public.fcc_record_action(text,uuid,text,text,timestamptz,timestamptz,text,text,boolean) TO service_role;
