-- DONEOVERNIGHT Phase 11 Identity & Wallet Platform
-- Safe additive migration. Run in the production Supabase SQL Editor.

create extension if not exists pgcrypto;

create sequence if not exists public.builder_number_seq
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create table if not exists public.builder_identities (
  id uuid primary key default gen_random_uuid(),
  journey_id text not null unique,
  builder_number bigint not null default nextval('public.builder_number_seq') unique,
  builder_type text,
  status text not null default 'Founding Builder',
  selected_language text,
  browser_language text,
  detected_content_language text,
  email_language text,
  identity_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.builder_identities
  add column if not exists journey_id text,
  add column if not exists builder_number bigint,
  add column if not exists builder_type text,
  add column if not exists status text default 'Founding Builder',
  add column if not exists selected_language text,
  add column if not exists browser_language text,
  add column if not exists detected_content_language text,
  add column if not exists email_language text,
  add column if not exists identity_payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists builder_identities_journey_id_unique_idx
  on public.builder_identities (journey_id);

alter table public.builder_identities
  alter column builder_number set default nextval('public.builder_number_seq');

update public.builder_identities
set builder_number = nextval('public.builder_number_seq')
where builder_number is null;

create unique index if not exists builder_identities_builder_number_unique_idx
  on public.builder_identities (builder_number);

create table if not exists public.wallet_passes (
  id uuid primary key default gen_random_uuid(),
  pass_kind text not null default 'builder',
  provider text not null default 'apple',
  journey_id text,
  builder_number bigint,
  founder_id text,
  serial_number text,
  status text not null default 'issued',
  signed boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  downloaded_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallet_passes
  add column if not exists pass_kind text default 'builder',
  add column if not exists provider text default 'apple',
  add column if not exists journey_id text,
  add column if not exists builder_number bigint,
  add column if not exists founder_id text,
  add column if not exists serial_number text,
  add column if not exists status text default 'issued',
  add column if not exists signed boolean default false,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists downloaded_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists wallet_passes_provider_serial_unique_idx
  on public.wallet_passes (provider, serial_number)
  where serial_number is not null;

create index if not exists wallet_passes_journey_id_idx
  on public.wallet_passes (journey_id);

create index if not exists wallet_passes_builder_number_idx
  on public.wallet_passes (builder_number);

alter table public.builder_identities enable row level security;
alter table public.wallet_passes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'builder_identities'
      and policyname = 'builder_identities_service_role_all'
  ) then
    create policy builder_identities_service_role_all
      on public.builder_identities
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wallet_passes'
      and policyname = 'wallet_passes_service_role_all'
  ) then
    create policy wallet_passes_service_role_all
      on public.wallet_passes
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

grant usage on sequence public.builder_number_seq to service_role;
grant all on table public.builder_identities to service_role;
grant all on table public.wallet_passes to service_role;

notify pgrst, 'reload schema';
