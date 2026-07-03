create table if not exists public.creator_live_runtime (
  creator_slug text primary key,
  creator_id uuid,
  platform text not null default 'tiktok',
  username text not null,
  is_live boolean not null default false,
  confirmed boolean not null default false,
  confidence text not null default 'unknown',
  source text not null default 'runtime',
  viewer_count integer,
  like_count bigint,
  live_duration text,
  live_started_at timestamptz,
  room_id text,
  live_title text,
  battle_active boolean not null default false,
  battle_opponent text,
  battle_result text,
  battle_win_streak integer,
  battle_updated_at timestamptz,
  gifts jsonb not null default '[]'::jsonb,
  top_gifters jsonb not null default '[]'::jsonb,
  rankings jsonb not null default '[]'::jsonb,
  live_url text,
  checked_at timestamptz not null default now(),
  last_event_at timestamptz,
  stale boolean not null default false,
  stale_after timestamptz not null default (now() + interval '75 seconds'),
  error text,
  capabilities jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists creator_live_runtime_updated_at_idx
  on public.creator_live_runtime (updated_at desc);

alter table public.creator_live_runtime enable row level security;

grant select, insert, update, delete on public.creator_live_runtime to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'creator_live_runtime'
      and policyname = 'Service role manages creator live runtime'
  ) then
    create policy "Service role manages creator live runtime"
      on public.creator_live_runtime
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
