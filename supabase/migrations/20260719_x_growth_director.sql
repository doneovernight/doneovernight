-- DONEOVERNIGHT Autonomous Growth Director.
-- This is a shadow-only strategy layer: it can recommend and learn, never publish.

create table if not exists public.x_growth_strategy_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null unique,
  mode text not null check (mode in ('shadow', 'auto')),
  cadence jsonb not null default '{}'::jsonb,
  content_mix jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  quality_signal numeric(5,4),
  performance_signal numeric(12,6),
  created_at timestamptz not null default now()
);

create table if not exists public.x_growth_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null unique,
  decision_type text not null check (decision_type in ('post', 'visual', 'repost', 'engagement', 'source', 'daily_brief')),
  subject_type text not null check (subject_type in ('draft', 'radar_item', 'publication', 'reply', 'strategy')),
  subject_id uuid,
  mode text not null check (mode in ('shadow', 'auto')),
  recommendation text not null check (recommendation in ('ignore', 'wait', 'review', 'schedule_shadow', 'no_visual', 'screenshot', 'quote_card', 'timeline', 'diagram', 'architecture_graphic', 'comparison', 'statistic_card', 'flow_chart', 'comment', 'quote', 'repost')),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  reasons jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.x_growth_daily_briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date not null unique,
  timezone text not null default 'Europe/Amsterdam',
  report jsonb not null default '{}'::jsonb,
  attention_required boolean not null default false,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.x_growth_reports (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_start date not null,
  report jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(period_type, period_start)
);

create index if not exists x_growth_decisions_subject_idx on public.x_growth_decisions(subject_type, subject_id, created_at desc);
create index if not exists x_growth_decisions_type_idx on public.x_growth_decisions(decision_type, created_at desc);
create index if not exists x_growth_strategy_snapshots_created_idx on public.x_growth_strategy_snapshots(created_at desc);

alter table public.x_growth_strategy_snapshots enable row level security;
alter table public.x_growth_decisions enable row level security;
alter table public.x_growth_daily_briefs enable row level security;
alter table public.x_growth_reports enable row level security;

grant select, insert, update, delete on table
  public.x_growth_strategy_snapshots,
  public.x_growth_decisions,
  public.x_growth_daily_briefs,
  public.x_growth_reports
to service_role;

alter table public.x_agent_runs drop constraint if exists x_agent_runs_run_type_check;
alter table public.x_agent_runs add constraint x_agent_runs_run_type_check check (run_type in (
  'discovery', 'publishing', 'engagement', 'analytics',
  'autonomy', 'autonomy_publish', 'autonomy_metrics', 'radar',
  'growth_director', 'daily_brief'
));
