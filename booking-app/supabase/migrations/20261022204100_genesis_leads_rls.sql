-- Founder names, phones, and emails. No anon or authenticated policies:
-- row level security with zero policies denies those roles. The service role
-- bypasses RLS and is the only role the server uses for this table.

ALTER TABLE public.genesis_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.genesis_leads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.genesis_leads TO service_role;
