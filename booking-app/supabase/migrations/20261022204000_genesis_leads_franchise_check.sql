-- The franchise filter stores how a business was classified. The first genesis_leads
-- migration left this column out, so a franchise update failed with
-- "Could not find the 'franchise_check' column of 'genesis_leads'".

ALTER TABLE public.genesis_leads
  ADD COLUMN IF NOT EXISTS franchise_check TEXT;
