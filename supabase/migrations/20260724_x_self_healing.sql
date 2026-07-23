-- Guarded self-healing incident ledger for the X Growth Agent.
-- Additive, service-role only, and safe to apply repeatedly. This migration
-- records operational state; it never executes recovery or destructive SQL.

begin;

create extension if not exists pgcrypto;

create table if not exists public.x_self_healing_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null,
  workspace_id uuid not null,
  component text not null,
  failure_category text not null check (failure_category in (
    'transient_network', 'rate_limit', 'oauth_access_expired',
    'oauth_refresh_invalid', 'identity_mismatch', 'x_write_rejected',
    'database_temporarily_unavailable', 'postgrest_schema_cache_stale',
    'database_constraint', 'missing_schema', 'workflow_trigger_gap',
    'stale_schedule', 'duplicate_execution', 'job_lock_stale', 'no_candidate',
    'candidate_quality_failure', 'predicted_performance_block', 'analytics_lag',
    'deployment_regression', 'unknown'
  )),
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  sanitized_error text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  selected_recovery text,
  recovery_started_at timestamptz,
  recovery_completed_at timestamptz,
  verification_result jsonb not null default '{}'::jsonb,
  status text not null default 'detected' check (status in ('detecting', 'contained', 'repairing', 'verifying', 'recovered', 'approval_required', 'escalated', 'failed_closed')),
  escalation_level text not null default 'none' check (escalation_level in ('none', 'operator', 'account_owner', 'critical')),
  run_id uuid,
  workflow_id text,
  schedule_id uuid,
  draft_id uuid,
  publication_id uuid,
  approval_required boolean not null default false,
  last_alerted_at timestamptz,
  alert_count integer not null default 0 check (alert_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, incident_key)
);

-- Make a partially-created table safe to resume. Existing rows are preserved;
-- defaults are only used for newly-added metadata columns.
alter table public.x_self_healing_incidents add column if not exists incident_key text;
alter table public.x_self_healing_incidents add column if not exists workspace_id uuid;
alter table public.x_self_healing_incidents add column if not exists component text;
alter table public.x_self_healing_incidents add column if not exists failure_category text;
alter table public.x_self_healing_incidents add column if not exists severity text;
alter table public.x_self_healing_incidents add column if not exists sanitized_error text default '';
alter table public.x_self_healing_incidents add column if not exists first_seen_at timestamptz default now();
alter table public.x_self_healing_incidents add column if not exists last_seen_at timestamptz default now();
alter table public.x_self_healing_incidents add column if not exists attempt_count integer default 1;
alter table public.x_self_healing_incidents add column if not exists selected_recovery text;
alter table public.x_self_healing_incidents add column if not exists recovery_started_at timestamptz;
alter table public.x_self_healing_incidents add column if not exists recovery_completed_at timestamptz;
alter table public.x_self_healing_incidents add column if not exists verification_result jsonb default '{}'::jsonb;
alter table public.x_self_healing_incidents add column if not exists status text default 'detected';
alter table public.x_self_healing_incidents add column if not exists escalation_level text default 'none';
alter table public.x_self_healing_incidents add column if not exists run_id uuid;
alter table public.x_self_healing_incidents add column if not exists workflow_id text;
alter table public.x_self_healing_incidents add column if not exists schedule_id uuid;
alter table public.x_self_healing_incidents add column if not exists draft_id uuid;
alter table public.x_self_healing_incidents add column if not exists publication_id uuid;
alter table public.x_self_healing_incidents add column if not exists approval_required boolean default false;
alter table public.x_self_healing_incidents add column if not exists last_alerted_at timestamptz;
alter table public.x_self_healing_incidents add column if not exists alert_count integer default 0;
alter table public.x_self_healing_incidents add column if not exists created_at timestamptz default now();
alter table public.x_self_healing_incidents add column if not exists updated_at timestamptz default now();

create index if not exists x_self_healing_active_idx
  on public.x_self_healing_incidents(workspace_id, status, last_seen_at desc);
create index if not exists x_self_healing_component_idx
  on public.x_self_healing_incidents(workspace_id, component, last_seen_at desc);
create index if not exists x_self_healing_run_idx
  on public.x_self_healing_incidents(workspace_id, run_id, last_seen_at desc);

alter table public.x_self_healing_incidents enable row level security;
grant select, insert, update, delete on table public.x_self_healing_incidents to service_role;

commit;
