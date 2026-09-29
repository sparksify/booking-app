create table public.genesis_intake (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  payload_hash text not null,
  payload jsonb not null,
  result jsonb,
  stage text not null check (stage in ('verify', 'discover', 'enrich', 'save')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'complete', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index genesis_intake_queue on public.genesis_intake(status, updated_at);
alter table public.genesis_intake enable row level security;
revoke all on public.genesis_intake from anon, authenticated;
grant select, insert, update on public.genesis_intake to service_role;
comment on table public.genesis_intake is 'Server-only Grok intake receipts and resumable Genesis processing queue.';
