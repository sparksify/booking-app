-- Pipeline runs table
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  industry TEXT NOT NULL,
  found INTEGER DEFAULT 0,
  enriched_count INTEGER DEFAULT 0,
  enrichment_rate INTEGER DEFAULT 0,
  loaded INTEGER DEFAULT 0,
  ownership_candidates INTEGER DEFAULT 0,
  run_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  city TEXT, industry TEXT, owner_name TEXT, email TEXT, domain TEXT, website TEXT,
  franchise_score INTEGER DEFAULT 0, ownership_score INTEGER DEFAULT 0, total_score INTEGER DEFAULT 0,
  ownership_candidate BOOLEAN DEFAULT FALSE, signals JSONB DEFAULT '[]',
  enriched BOOLEAN DEFAULT FALSE, loaded BOOLEAN DEFAULT FALSE, smartlead_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES pipeline_prospects(id),
  business_name TEXT, email TEXT, reply_text TEXT,
  classification TEXT, ownership_candidate BOOLEAN DEFAULT FALSE,
  drafted_response TEXT, raw_payload JSONB,
  replied_at TIMESTAMPTZ DEFAULT NOW(), reviewed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_pipeline_prospects_email ON pipeline_prospects(email);
CREATE INDEX IF NOT EXISTS idx_pipeline_prospects_business_city ON pipeline_prospects(business_name, city);
CREATE INDEX IF NOT EXISTS idx_pipeline_replies_reviewed ON pipeline_replies(reviewed, replied_at DESC);
