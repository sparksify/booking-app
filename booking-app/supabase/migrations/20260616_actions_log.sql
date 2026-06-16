-- Migration: create actions_log table for Kanso mobile PWA
-- Run in Supabase SQL editor or via CLI: supabase db push

create table if not exists public.actions_log (
  id              uuid primary key default gen_random_uuid(),
  contact_id_ghl  text not null,
  action_type     text not null check (action_type in ('booking_link','workflow','short_link','note','stage')),
  payload         jsonb default '{}',
  fired_by        text,
  fired_at        timestamptz not null default now(),
  resolved_at     timestamptz,
  success         boolean,
  response_body   jsonb
);

-- Index for looking up all actions on a contact
create index if not exists actions_log_contact_idx on public.actions_log (contact_id_ghl);

-- Index for audit log queries by date
create index if not exists actions_log_fired_at_idx on public.actions_log (fired_at desc);

-- RLS: only authenticated users can read/insert
alter table public.actions_log enable row level security;

create policy "Authenticated users can insert actions"
  on public.actions_log for insert
  to authenticated
  with check (true);

create policy "Authenticated users can read actions"
  on public.actions_log for select
  to authenticated
  using (true);

create policy "Authenticated users can update actions"
  on public.actions_log for update
  to authenticated
  using (true);
