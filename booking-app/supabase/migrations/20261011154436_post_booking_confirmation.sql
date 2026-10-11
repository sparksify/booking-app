begin;
alter table public.brands add column if not exists thank_you_redirect_url text;
create table public.booking_confirmations (
  token_hash text primary key check (length(token_hash) = 64),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  audience text not null,
  timezone text not null,
  title text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index booking_confirmations_expiry_idx on public.booking_confirmations(expires_at);
alter table public.booking_confirmations enable row level security;
revoke all on public.booking_confirmations from public, anon, authenticated;
grant select, insert, delete on public.booking_confirmations to service_role;
commit;
-- Expired references are rejected at lookup. Delete expired rows periodically:
-- delete from public.booking_confirmations where expires_at < now();
