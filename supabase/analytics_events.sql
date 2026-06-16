create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  task_id text,
  source text,
  route text,
  referrer text,
  session_id text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_event_type_idx
  on public.analytics_events (event_type);

create index if not exists analytics_events_route_idx
  on public.analytics_events (route);

create index if not exists analytics_events_task_id_idx
  on public.analytics_events (task_id);

alter table public.analytics_events enable row level security;
