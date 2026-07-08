-- Attribution columns so replies can be tied back to source / variant / city.
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS email_source   TEXT;
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS verification   TEXT;
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS phone          TEXT;
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS variant_labels TEXT;
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS rating         NUMERIC;
ALTER TABLE pipeline_prospects ADD COLUMN IF NOT EXISTS review_count   INTEGER;

-- Reply attribution helpers copied onto the reply at capture time.
ALTER TABLE pipeline_replies ADD COLUMN IF NOT EXISTS city           TEXT;
ALTER TABLE pipeline_replies ADD COLUMN IF NOT EXISTS variant_labels TEXT;
ALTER TABLE pipeline_replies ADD COLUMN IF NOT EXISTS email_source   TEXT;

-- Case-insensitive email match for webhook prospect lookups.
CREATE INDEX IF NOT EXISTS idx_pipeline_prospects_email_lower ON pipeline_prospects (lower(email));
