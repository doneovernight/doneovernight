-- DONEOVERNIGHT X Content Agent V3. Additive, idempotent autonomy controls.
-- RLS remains enabled. Only the server-side service_role receives table privileges.

alter table public.x_agent_runs drop constraint if exists x_agent_runs_run_type_check;
alter table public.x_agent_runs add constraint x_agent_runs_run_type_check check (run_type in ('discovery', 'publishing', 'engagement', 'analytics', 'autonomy', 'autonomy_publish', 'autonomy_metrics'));

create table if not exists public.x_autonomy_decisions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.x_drafts(id) on delete cascade,
  decision_key text not null unique,
  mode text not null check (mode in ('off', 'shadow', 'auto')),
  decision text not null check (decision in ('would_approve', 'would_reject', 'scheduled', 'blocked', 'cancelled', 'published')),
  objective text,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  scores jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  blocking_thresholds jsonb not null default '[]'::jsonb,
  predicted_performance numeric(4,3) check (predicted_performance between 0 and 1),
  source_reliability numeric(4,3) check (source_reliability between 0 and 1),
  risk_score numeric(4,3) check (risk_score between 0 and 1),
  fatigue_score numeric(4,3) check (fatigue_score between 0 and 1),
  would_auto_approve boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.x_autonomy_schedules (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.x_drafts(id) on delete cascade,
  decision_id uuid references public.x_autonomy_decisions(id) on delete set null,
  scheduled_for timestamptz not null,
  status text not null default 'shadow' check (status in ('shadow', 'scheduled', 'delayed', 'cancelled', 'published')),
  objective text,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.x_metric_checkpoints (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.x_publications(id) on delete cascade,
  checkpoint_hours integer not null check (checkpoint_hours in (1, 6, 24, 72, 168)),
  due_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  normalized_performance numeric(8,4),
  unique (publication_id, checkpoint_hours)
);

create table if not exists public.x_learning_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  status text not null default 'inactive' check (status in ('active', 'inactive', 'reverted')),
  sample_size integer not null,
  timing_sample_size integer not null default 0,
  weights jsonb not null default '{}'::jsonb,
  calibration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  notes text
);

create table if not exists public.x_autonomy_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  draft_id uuid references public.x_drafts(id) on delete set null,
  schedule_id uuid references public.x_autonomy_schedules(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists x_autonomy_decisions_draft_created_idx on public.x_autonomy_decisions(draft_id, created_at desc);
create index if not exists x_autonomy_schedules_status_scheduled_idx on public.x_autonomy_schedules(status, scheduled_for);
create index if not exists x_metric_checkpoints_due_idx on public.x_metric_checkpoints(due_at);
create index if not exists x_autonomy_audit_events_created_idx on public.x_autonomy_audit_events(created_at desc);

alter table public.x_autonomy_decisions enable row level security;
alter table public.x_autonomy_schedules enable row level security;
alter table public.x_metric_checkpoints enable row level security;
alter table public.x_learning_versions enable row level security;
alter table public.x_autonomy_audit_events enable row level security;

grant select, insert, update, delete on table public.x_autonomy_decisions, public.x_autonomy_schedules, public.x_metric_checkpoints, public.x_learning_versions, public.x_autonomy_audit_events to service_role;
