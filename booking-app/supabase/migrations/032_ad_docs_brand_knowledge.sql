-- Ad Studio: brand-tagged reference docs with stored AI summaries,
-- reusable as brand knowledge for future campaigns.

ALTER TABLE ad_reference_docs ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE ad_reference_docs ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE ad_reference_docs ADD COLUMN IF NOT EXISTS summary_status TEXT DEFAULT 'pending'; -- pending | ready | failed | skipped

CREATE INDEX IF NOT EXISTS idx_ad_reference_docs_brand ON ad_reference_docs(brand);
