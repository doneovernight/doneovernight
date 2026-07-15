-- DONEOVERNIGHT X Content Agent V1. Apply through the Supabase SQL editor or CLI.
create extension if not exists pgcrypto;

create table if not exists public.x_sources (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  title text not null,
  publisher text not null,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  evidence_summary text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table if not exists public.x_topic_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.x_sources(id) on delete set null,
  source_url text not null unique,
  headline text not null,
  topic_cluster text not null,
  entities jsonb not null default '[]'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  evidence_summary text not null,
  relevance_score numeric(4,3) not null check (relevance_score between 0 and 1),
  recency_score numeric(4,3) not null check (recency_score between 0 and 1),
  authority_score numeric(4,3) not null check (authority_score between 0 and 1),
  novelty_score numeric(4,3) not null check (novelty_score between 0 and 1),
  fit_score numeric(4,3) not null check (fit_score between 0 and 1),
  publish_score numeric(4,3) not null check (publish_score between 0 and 1),
  status text not null default 'accepted' check (status in ('accepted','rejected','drafted')),
  created_at timestamptz not null default now()
);

create table if not exists public.x_drafts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.x_topic_candidates(id) on delete set null,
  text text not null,
  weighted_character_count integer not null check (weighted_character_count between 0 and 280),
  raw_character_count integer not null,
  post_type text not null check (post_type in ('news_interpretation','practical_insight','build_note')),
  topic_cluster text not null,
  source_references jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  quality_score numeric(4,3) not null check (quality_score between 0 and 1),
  duplicate_score numeric(4,3) not null default 0 check (duplicate_score between 0 and 1),
  mode text not null check (mode in ('draft','approve','auto')),
  status text not null default 'queued' check (status in ('queued','approved','rejected','published')),
  rejection_reason text,
  model_output jsonb,
  approved_at timestamptz,
  published_at timestamptz,
  x_post_id text unique,
  x_post_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.x_publications (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.x_drafts(id) on delete restrict,
  status text not null check (status in ('publishing','published','failed')),
  attempted_at timestamptz not null default now(),
  published_at timestamptz,
  x_post_id text unique,
  x_post_url text,
  x_response_status integer,
  error_message text
);

create table if not exists public.x_agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('discovery','publishing')),
  status text not null check (status in ('running','completed','partial','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.x_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create index if not exists x_candidates_created_at_idx on public.x_topic_candidates(created_at desc);
create index if not exists x_drafts_status_created_at_idx on public.x_drafts(status, created_at desc);
create index if not exists x_publications_published_at_idx on public.x_publications(published_at desc);
create index if not exists x_runs_type_started_at_idx on public.x_agent_runs(run_type, started_at desc);

alter table public.x_sources enable row level security;
alter table public.x_topic_candidates enable row level security;
alter table public.x_drafts enable row level security;
alter table public.x_publications enable row level security;
alter table public.x_agent_runs enable row level security;
alter table public.x_settings enable row level security;
