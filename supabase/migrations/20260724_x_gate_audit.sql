-- Per-candidate autonomy gate audit ledger.
-- Additive, workspace-scoped, service-role only, and safe to apply repeatedly.

begin;

create extension if not exists pgcrypto;

create table if not exists public.x_gate_audits (
  id uuid primary key default gen_random_uuid(),
  audit_key text not null,
  workspace_id uuid not null,
  run_id text,
  candidate_id text,
  draft_id text,
  title text,
  discovery_tier text,
  confidence numeric,
  quality_score numeric,
  authority_score numeric,
  freshness_score numeric,
  novelty_score numeric,
  gate_results jsonb not null default '{}'::jsonb,
  primary_blocking_gate text,
  secondary_blocking_gates jsonb not null default '[]'::jsonb,
  final_eligibility boolean not null default false,
  rejection_reason text,
  created_at timestamptz not null default now(),
  unique (workspace_id, audit_key)
);

alter table public.x_gate_audits add column if not exists audit_key text;
alter table public.x_gate_audits add column if not exists workspace_id uuid;
alter table public.x_gate_audits add column if not exists run_id text;
alter table public.x_gate_audits add column if not exists candidate_id text;
alter table public.x_gate_audits add column if not exists draft_id text;
alter table public.x_gate_audits add column if not exists title text;
alter table public.x_gate_audits add column if not exists discovery_tier text;
alter table public.x_gate_audits add column if not exists confidence numeric;
alter table public.x_gate_audits add column if not exists quality_score numeric;
alter table public.x_gate_audits add column if not exists authority_score numeric;
alter table public.x_gate_audits add column if not exists freshness_score numeric;
alter table public.x_gate_audits add column if not exists novelty_score numeric;
alter table public.x_gate_audits add column if not exists gate_results jsonb default '{}'::jsonb;
alter table public.x_gate_audits add column if not exists primary_blocking_gate text;
alter table public.x_gate_audits add column if not exists secondary_blocking_gates jsonb default '[]'::jsonb;
alter table public.x_gate_audits add column if not exists final_eligibility boolean default false;
alter table public.x_gate_audits add column if not exists rejection_reason text;
alter table public.x_gate_audits add column if not exists created_at timestamptz default now();

create unique index if not exists x_gate_audits_workspace_key_idx
  on public.x_gate_audits(workspace_id, audit_key);
create index if not exists x_gate_audits_workspace_run_idx
  on public.x_gate_audits(workspace_id, run_id, created_at desc);
create index if not exists x_gate_audits_workspace_created_idx
  on public.x_gate_audits(workspace_id, created_at desc);

alter table public.x_gate_audits enable row level security;
grant select, insert, update, delete on table public.x_gate_audits to service_role;

commit;
