-- Creator OS: provider connection registry.
-- Keeps TikTok and future platform connection state server-side only.

create table if not exists public.creator_connections (
  id uuid primary key default gen_random_uuid(),
  creator_slug text not null,
  provider text not null,
  status text not null default 'not_connected',
  username text,
  external_id text,
  access_token_encrypted text,
  session_reference text,
  runtime_enabled boolean not null default false,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_connections_provider_check
    check (provider in ('tiktok')),
  constraint creator_connections_status_check
    check (status in ('connected', 'not_connected', 'needs_attention', 'disconnected'))
);

create unique index if not exists creator_connections_slug_provider_idx
  on public.creator_connections (creator_slug, provider);

create index if not exists creator_connections_provider_status_idx
  on public.creator_connections (provider, status, updated_at desc);

alter table public.creator_connections enable row level security;

grant select, insert, update, delete on public.creator_connections to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'creator_connections'
      and policyname = 'Service role manages creator connections'
  ) then
    create policy "Service role manages creator connections"
      on public.creator_connections
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
