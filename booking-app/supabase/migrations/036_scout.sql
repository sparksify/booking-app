-- Scout: durable autonomous company discovery upstream of Genesis.
CREATE TABLE IF NOT EXISTS scout_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'NEVER_STARTED' CHECK (status IN ('NEVER_STARTED','RUNNING','PAUSED','ERROR')),
  searches_per_hour_limit INTEGER NOT NULL DEFAULT 4 CHECK (searches_per_hour_limit > 0),
  searches_per_day_limit INTEGER NOT NULL DEFAULT 40 CHECK (searches_per_day_limit > 0),
  classifications_per_day_limit INTEGER NOT NULL DEFAULT 30 CHECK (classifications_per_day_limit > 0),
  genesis_per_day_limit INTEGER NOT NULL DEFAULT 10 CHECK (genesis_per_day_limit > 0),
  minimum_qualification_score INTEGER NOT NULL DEFAULT 65 CHECK (minimum_qualification_score BETWEEN 0 AND 100),
  priority_markets TEXT[] NOT NULL DEFAULT '{}',
  excluded_markets TEXT[] NOT NULL DEFAULT '{}',
  priority_verticals TEXT[] NOT NULL DEFAULT '{}',
  excluded_verticals TEXT[] NOT NULL DEFAULT '{}',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO scout_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS scout_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), country TEXT NOT NULL DEFAULT 'US', state TEXT,
  metro TEXT NOT NULL, city TEXT NOT NULL, vertical TEXT NOT NULL, strategy TEXT NOT NULL,
  query TEXT, query_variant INTEGER NOT NULL DEFAULT 0, provider TEXT NOT NULL DEFAULT 'serpapi',
  priority NUMERIC NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'READY',
  last_run_at TIMESTAMPTZ, next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), claimed_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0, search_results_count INTEGER NOT NULL DEFAULT 0,
  candidates_found INTEGER NOT NULL DEFAULT 0, candidates_qualified INTEGER NOT NULL DEFAULT 0,
  duplicates_found INTEGER NOT NULL DEFAULT 0, consecutive_errors INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (metro, vertical, strategy)
);
CREATE INDEX IF NOT EXISTS idx_scout_missions_due ON scout_missions(status, next_run_at, priority DESC);

CREATE TABLE IF NOT EXISTS scout_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_name TEXT NOT NULL, normalized_name TEXT NOT NULL,
  domain TEXT, website TEXT, city TEXT, state TEXT, metro TEXT, industry TEXT,
  qualification_status TEXT NOT NULL DEFAULT 'DISCOVERED', qualification_score INTEGER,
  qualification_reasons JSONB NOT NULL DEFAULT '[]', signals JSONB NOT NULL DEFAULT '{}',
  rejection_reason TEXT, genesis_status TEXT NOT NULL DEFAULT 'NOT_QUEUED', pipeline_prospect_id UUID REFERENCES pipeline_prospects(id),
  primary_strategy TEXT, primary_mission_id UUID REFERENCES scout_missions(id), last_error TEXT, retry_count INTEGER NOT NULL DEFAULT 0,
  first_discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_candidates_domain ON scout_candidates(lower(domain)) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scout_candidates_name_place ON scout_candidates(normalized_name, metro);
CREATE INDEX IF NOT EXISTS idx_scout_candidates_queue ON scout_candidates(qualification_status, genesis_status, created_at);

CREATE TABLE IF NOT EXISTS scout_candidate_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id UUID NOT NULL REFERENCES scout_candidates(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES scout_missions(id), strategy TEXT NOT NULL, source_url TEXT NOT NULL,
  source_domain TEXT, source_title TEXT, source_snippet TEXT, signal_type TEXT, raw_payload JSONB NOT NULL DEFAULT '{}',
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(candidate_id, source_url)
);
CREATE TABLE IF NOT EXISTS scout_events (
  id BIGSERIAL PRIMARY KEY, event_type TEXT NOT NULL, candidate_id UUID REFERENCES scout_candidates(id) ON DELETE SET NULL,
  mission_id UUID REFERENCES scout_missions(id) ON DELETE SET NULL, message TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scout_events_recent ON scout_events(created_at DESC);
CREATE TABLE IF NOT EXISTS scout_usage (
  id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, provider TEXT, candidate_id UUID REFERENCES scout_candidates(id) ON DELETE SET NULL,
  mission_id UUID REFERENCES scout_missions(id) ON DELETE SET NULL, estimated_cost NUMERIC, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scout_usage_kind_time ON scout_usage(kind, created_at DESC);

ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS scout_candidate_id UUID REFERENCES scout_candidates(id);
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS scout_strategy TEXT;
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS scout_mission_id UUID REFERENCES scout_missions(id);
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS scout_score INTEGER;
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS scout_source_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_prospects_scout_candidate ON pipeline_prospects(scout_candidate_id) WHERE scout_candidate_id IS NOT NULL;

-- Recover claims abandoned by an interrupted serverless invocation, then atomically claim due work.
CREATE OR REPLACE FUNCTION claim_scout_missions(claim_limit INTEGER DEFAULT 2)
RETURNS SETOF scout_missions LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE scout_missions SET status='READY', claimed_at=NULL, updated_at=NOW()
    WHERE status='RUNNING' AND claimed_at < NOW() - INTERVAL '15 minutes';
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM scout_missions WHERE status='READY' AND next_run_at <= NOW()
    ORDER BY priority DESC, next_run_at ASC FOR UPDATE SKIP LOCKED LIMIT claim_limit
  )
  UPDATE scout_missions m SET status='RUNNING', claimed_at=NOW(), updated_at=NOW()
  FROM picked WHERE m.id=picked.id RETURNING m.*;
END; $$;
