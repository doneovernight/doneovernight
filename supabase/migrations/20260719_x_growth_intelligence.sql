-- DONEOVERNIGHT Growth Intelligence: append-only executive intelligence.
-- It records evidence and recommendations only; none of these tables can publish.

create table if not exists public.x_growth_intelligence_memory (
  id uuid primary key default gen_random_uuid(),
  memory_type text not null check (memory_type in ('topic', 'format', 'visual', 'posting_time', 'hook', 'industry', 'audience', 'competitor', 'trend', 'gap', 'business_impact')),
  subject text not null,
  evidence jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.x_account_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  health jsonb not null default '{}'::jsonb,
  authority_score numeric(5,4),
  trust_score numeric(5,4),
  content_diversity numeric(5,4),
  created_at timestamptz not null default now()
);

create table if not exists public.x_competitor_observations (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text not null,
  observation jsonb not null default '{}'::jsonb,
  opportunity text,
  saturation text,
  emerging_signal text,
  created_at timestamptz not null default now(),
  unique(source_name, source_url)
);

create table if not exists public.x_growth_gaps (
  id uuid primary key default gen_random_uuid(),
  gap_key text not null unique,
  topic text not null,
  explanation text not null,
  opportunity_score numeric(5,4) not null check (opportunity_score between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'observing', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.x_growth_series (
  id uuid primary key default gen_random_uuid(),
  series_key text not null unique,
  name text not null,
  theme text not null,
  audience jsonb not null default '[]'::jsonb,
  cadence text not null default 'proposed',
  status text not null default 'proposed' check (status in ('proposed', 'active', 'paused', 'archived')),
  performance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.x_growth_calendar_entries (
  id uuid primary key default gen_random_uuid(),
  calendar_key text not null unique,
  planned_for date not null,
  topic text not null,
  format text not null,
  business_goal text not null,
  series_id uuid references public.x_growth_series(id) on delete set null,
  rationale text not null,
  status text not null default 'shadow_proposal' check (status in ('shadow_proposal', 'review', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.x_growth_experiments (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null unique,
  hypothesis text not null,
  variants jsonb not null default '[]'::jsonb,
  metric text not null,
  status text not null default 'proposed' check (status in ('proposed', 'observing', 'completed', 'archived')),
  findings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.x_growth_executive_reports (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  report jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(period_start)
);

create index if not exists x_growth_memory_type_subject_idx on public.x_growth_intelligence_memory(memory_type, subject, created_at desc);
create index if not exists x_health_week_idx on public.x_account_health_snapshots(week_start desc);
create index if not exists x_growth_calendar_planned_idx on public.x_growth_calendar_entries(planned_for, status);

alter table public.x_growth_intelligence_memory enable row level security;
alter table public.x_account_health_snapshots enable row level security;
alter table public.x_competitor_observations enable row level security;
alter table public.x_growth_gaps enable row level security;
alter table public.x_growth_series enable row level security;
alter table public.x_growth_calendar_entries enable row level security;
alter table public.x_growth_experiments enable row level security;
alter table public.x_growth_executive_reports enable row level security;

grant select, insert, update, delete on table
  public.x_growth_intelligence_memory,
  public.x_account_health_snapshots,
  public.x_competitor_observations,
  public.x_growth_gaps,
  public.x_growth_series,
  public.x_growth_calendar_entries,
  public.x_growth_experiments,
  public.x_growth_executive_reports
to service_role;

alter table public.x_agent_runs drop constraint if exists x_agent_runs_run_type_check;
alter table public.x_agent_runs add constraint x_agent_runs_run_type_check check (run_type in (
  'discovery', 'publishing', 'engagement', 'analytics',
  'autonomy', 'autonomy_publish', 'autonomy_metrics', 'radar',
  'growth_director', 'daily_brief', 'growth_intelligence', 'executive_report'
));
