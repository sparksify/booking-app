-- Ad Studio: reference docs, ad library, briefs, generated ads

CREATE TABLE IF NOT EXISTS ad_reference_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT,            -- path in 'ad-studio' storage bucket
  extracted_text TEXT,          -- text content used as AI context
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT DEFAULT 'manual',        -- 'manual' | 'meta_ad_library'
  fb_ad_archive_id TEXT UNIQUE,        -- Meta Ad Library archive id (dedupe)
  advertiser TEXT,
  headline TEXT,
  body TEXT,
  link_url TEXT,
  snapshot_url TEXT,                   -- Meta Ad Library snapshot link
  industry TEXT DEFAULT 'franchise',
  notes TEXT,
  starred BOOLEAN DEFAULT false,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  objective TEXT,               -- campaign objective / goals
  offer TEXT,                   -- what we're promoting
  audience TEXT,
  brief TEXT,                   -- free-form brief text
  styles TEXT[] DEFAULT '{}',   -- selected style keys
  variants_per_style INT DEFAULT 3,
  doc_ids UUID[] DEFAULT '{}',  -- reference docs used
  library_ids UUID[] DEFAULT '{}', -- inspiration ads used
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID REFERENCES ad_briefs(id) ON DELETE CASCADE,
  style TEXT NOT NULL,                 -- style key (hormozi, brunson, schwartz, ogilvy)
  headline TEXT,
  primary_text TEXT,
  description TEXT,
  cta TEXT,
  lead_form_subject TEXT,              -- lead form intro headline
  lead_form_greeting TEXT,
  image_prompt TEXT,
  image_path TEXT,                     -- generated image path in storage
  image_url TEXT,                      -- public URL of generated image
  status TEXT DEFAULT 'draft',         -- draft | approved | published
  fb_campaign_id TEXT,
  fb_adset_id TEXT,
  fb_creative_id TEXT,
  fb_ad_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_generations_brief ON ad_generations(brief_id);
CREATE INDEX IF NOT EXISTS idx_ad_library_starred ON ad_library(starred);

-- Storage bucket for reference docs + generated images (public read for ad images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-studio', 'ad-studio', true)
ON CONFLICT (id) DO NOTHING;
