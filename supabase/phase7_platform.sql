create extension if not exists pgcrypto;

create table if not exists public.journey_confirmations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  social_handle text,
  journey_id text,
  chosen_path text,
  chosen_interests text[] default '{}',
  result text,
  source text default 'how_it_works',
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'opened', 'clicked')),
  provider text,
  message_id text,
  error text,
  raw_payload jsonb default '{}'::jsonb
);

create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  journey_id text not null unique,
  email text,
  social_handle text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  browser_language text,
  device text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_percentage integer not null default 0,
  chosen_path text,
  chosen_interests text[] not null default '{}',
  builder_result text,
  automation_choice text,
  time_spent integer not null default 0,
  returned boolean not null default false,
  profile_copied boolean not null default false,
  share_clicked boolean not null default false,
  follow_clicked boolean not null default false,
  last_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journeys add column if not exists email text;
alter table public.journeys add column if not exists social_handle text;
alter table public.journeys add column if not exists source text;
alter table public.journeys add column if not exists utm_source text;
alter table public.journeys add column if not exists utm_medium text;
alter table public.journeys add column if not exists utm_campaign text;
alter table public.journeys add column if not exists browser_language text;
alter table public.journeys add column if not exists device text;
alter table public.journeys add column if not exists started_at timestamptz not null default now();
alter table public.journeys add column if not exists completed_at timestamptz;
alter table public.journeys add column if not exists completion_percentage integer not null default 0;
alter table public.journeys add column if not exists chosen_path text;
alter table public.journeys add column if not exists chosen_interests text[] not null default '{}';
alter table public.journeys add column if not exists builder_result text;
alter table public.journeys add column if not exists automation_choice text;
alter table public.journeys add column if not exists time_spent integer not null default 0;
alter table public.journeys add column if not exists returned boolean not null default false;
alter table public.journeys add column if not exists profile_copied boolean not null default false;
alter table public.journeys add column if not exists share_clicked boolean not null default false;
alter table public.journeys add column if not exists follow_clicked boolean not null default false;
alter table public.journeys add column if not exists last_page text;
alter table public.journeys add column if not exists created_at timestamptz not null default now();
alter table public.journeys add column if not exists updated_at timestamptz not null default now();

create table if not exists public.visitor_progress (
  id uuid primary key default gen_random_uuid(),
  journey_id text not null unique,
  active_step integer not null default 1,
  unlocked_step integer not null default 1,
  completed_steps text[] not null default '{}',
  completion_percentage integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viewer_builds (
  id uuid primary key default gen_random_uuid(),
  viewer_build_id text unique,
  journey_id text,
  email text,
  title text not null,
  description text,
  problem text,
  website text,
  browser_language text,
  status text not null default 'submitted',
  votes integer not null default 0,
  comments_count integer not null default 0,
  assigned_to text,
  assigned_operator text,
  public_roadmap boolean not null default false,
  roadmap_status text,
  archive_reason text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.viewer_builds add column if not exists viewer_build_id text;
alter table public.viewer_builds add column if not exists description text;
alter table public.viewer_builds add column if not exists problem text;
alter table public.viewer_builds add column if not exists website text;
alter table public.viewer_builds add column if not exists browser_language text;
alter table public.viewer_builds add column if not exists assigned_to text;
alter table public.viewer_builds add column if not exists assigned_operator text;
alter table public.viewer_builds add column if not exists comments_count integer not null default 0;
alter table public.viewer_builds add column if not exists public_roadmap boolean not null default false;
alter table public.viewer_builds add column if not exists roadmap_status text;
alter table public.viewer_builds add column if not exists archive_reason text;
alter table public.viewer_builds add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table public.viewer_builds add column if not exists updated_at timestamptz not null default now();

create table if not exists public.resource_interest (
  id uuid primary key default gen_random_uuid(),
  journey_id text,
  email text,
  resource text not null,
  status text not null default 'notify_me',
  source_page text,
  created_at timestamptz not null default now()
);

create table if not exists public.journal (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null default 'Added',
  title text not null,
  body text,
  summary text,
  deployment_id text,
  commit_sha text,
  status text not null default 'published',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.live_status (
  id uuid primary key default gen_random_uuid(),
  current_build text,
  current_operator text,
  current_client text,
  current_repository text,
  current_branch text,
  current_commit text,
  latest_deployment text,
  heartbeat text,
  estimated_completion text,
  current_focus text,
  current_progress text,
  progress_percentage integer not null default 0,
  repository_status text,
  recent_activity text[] not null default '{}',
  latest_wins text[] not null default '{}',
  recently_finished text[] not null default '{}',
  upcoming_builds text[] not null default '{}',
  placeholder boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  journey_id text,
  email text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'opened', 'clicked')),
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  error text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.follow_events (
  id uuid primary key default gen_random_uuid(),
  journey_id text,
  source_page text,
  target_url text,
  clicked_at timestamptz not null default now()
);

create table if not exists public.page_events (
  id uuid primary key default gen_random_uuid(),
  journey_id text,
  page text not null,
  entered_at timestamptz not null default now(),
  left_at timestamptz,
  duration integer not null default 0,
  referrer text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.share_events (
  id uuid primary key default gen_random_uuid(),
  journey_id text,
  viewer_build_id text,
  event_type text not null,
  page text,
  method text,
  url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.share_events add column if not exists viewer_build_id text;
alter table public.share_events add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create index if not exists journeys_started_at_idx on public.journeys (started_at desc);
create index if not exists journey_confirmations_email_idx on public.journey_confirmations (email);
create index if not exists journey_confirmations_journey_id_idx on public.journey_confirmations (journey_id);
create index if not exists journey_confirmations_status_idx on public.journey_confirmations (status);
create index if not exists journey_confirmations_created_at_idx on public.journey_confirmations (created_at desc);
create index if not exists journeys_source_idx on public.journeys (source);
create index if not exists journeys_chosen_path_idx on public.journeys (chosen_path);
create index if not exists visitor_progress_journey_id_idx on public.visitor_progress (journey_id);
create index if not exists viewer_builds_created_at_idx on public.viewer_builds (created_at desc);
create index if not exists viewer_builds_status_idx on public.viewer_builds (status);
create unique index if not exists viewer_builds_viewer_build_id_unique_idx on public.viewer_builds (viewer_build_id);
create index if not exists resource_interest_created_at_idx on public.resource_interest (created_at desc);
create index if not exists journal_created_at_idx on public.journal (created_at desc);
create unique index if not exists journal_deployment_id_unique_idx
  on public.journal (deployment_id);
create index if not exists live_status_updated_at_idx on public.live_status (updated_at desc);
create index if not exists email_events_created_at_idx on public.email_events (created_at desc);
create index if not exists email_events_status_idx on public.email_events (status);
create index if not exists follow_events_clicked_at_idx on public.follow_events (clicked_at desc);
create index if not exists page_events_entered_at_idx on public.page_events (entered_at desc);
create index if not exists page_events_page_idx on public.page_events (page);
create index if not exists share_events_created_at_idx on public.share_events (created_at desc);
create index if not exists share_events_event_type_idx on public.share_events (event_type);
create index if not exists share_events_viewer_build_id_idx on public.share_events (viewer_build_id);

alter table public.journeys enable row level security;
alter table public.journey_confirmations enable row level security;
alter table public.visitor_progress enable row level security;
alter table public.viewer_builds enable row level security;
alter table public.resource_interest enable row level security;
alter table public.journal enable row level security;
alter table public.live_status enable row level security;
alter table public.email_events enable row level security;
alter table public.follow_events enable row level security;
alter table public.page_events enable row level security;
alter table public.share_events enable row level security;

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.journey_confirmations to service_role;
grant select, insert, update, delete on table public.journeys to service_role;
grant select, insert, update, delete on table public.visitor_progress to service_role;
grant select, insert, update, delete on table public.viewer_builds to service_role;
grant select, insert, update, delete on table public.resource_interest to service_role;
grant select, insert, update, delete on table public.journal to service_role;
grant select, insert, update, delete on table public.live_status to service_role;
grant select, insert, update, delete on table public.email_events to service_role;
grant select, insert, update, delete on table public.follow_events to service_role;
grant select, insert, update, delete on table public.page_events to service_role;
grant select, insert, update, delete on table public.share_events to service_role;

grant usage, select on all sequences in schema public to service_role;
