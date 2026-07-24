-- Per-candidate autonomy gate audit ledger.
-- Additive, workspace-scoped, service-role only, and safe to apply repeatedly.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.workspaces') is null then
    raise exception 'public.workspaces must exist before applying the gate-audit migration';
  end if;
end
$$ language plpgsql;

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

alter table public.x_gate_audits add column if not exists id uuid;
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

alter table public.x_gate_audits alter column id set default gen_random_uuid();
update public.x_gate_audits set id = gen_random_uuid() where id is null;

-- A partial first application may have created nullable columns. Recover their
-- workspace only through an existing tenant-owned relationship. Never assign
-- audit rows to a global/default workspace.
do $$
begin
  if to_regclass('public.x_drafts') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'x_drafts' and column_name = 'workspace_id'
     ) then
    update public.x_gate_audits audit
       set workspace_id = draft.workspace_id
      from public.x_drafts draft
     where audit.workspace_id is null
       and audit.draft_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and draft.id = audit.draft_id::uuid;
  end if;

  if to_regclass('public.x_topic_candidates') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'x_topic_candidates' and column_name = 'workspace_id'
     ) then
    update public.x_gate_audits audit
       set workspace_id = candidate.workspace_id
      from public.x_topic_candidates candidate
     where audit.workspace_id is null
       and audit.candidate_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and candidate.id = audit.candidate_id::uuid;
  end if;

  if to_regclass('public.x_agent_runs') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'x_agent_runs' and column_name = 'workspace_id'
     ) then
    update public.x_gate_audits audit
       set workspace_id = run.workspace_id
      from public.x_agent_runs run
     where audit.workspace_id is null
       and audit.run_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and run.id = audit.run_id::uuid;
  end if;
end
$$ language plpgsql;

update public.x_gate_audits set gate_results = '{}'::jsonb where gate_results is null;
update public.x_gate_audits set secondary_blocking_gates = '[]'::jsonb where secondary_blocking_gates is null;
update public.x_gate_audits set final_eligibility = false where final_eligibility is null;
update public.x_gate_audits set created_at = now() where created_at is null;

do $$
declare
  unresolved_workspace_count bigint;
  unresolved_key_count bigint;
  orphan_workspace_count bigint;
begin
  select count(*) into unresolved_workspace_count
    from public.x_gate_audits where workspace_id is null;
  if unresolved_workspace_count > 0 then
    raise exception '% x_gate_audits rows have no relationship-derived workspace_id', unresolved_workspace_count;
  end if;

  select count(*) into unresolved_key_count
    from public.x_gate_audits where audit_key is null or btrim(audit_key) = '';
  if unresolved_key_count > 0 then
    raise exception '% x_gate_audits rows have no valid audit_key', unresolved_key_count;
  end if;

  select count(*) into orphan_workspace_count
    from public.x_gate_audits audit
   where not exists (select 1 from public.workspaces workspace where workspace.id = audit.workspace_id);
  if orphan_workspace_count > 0 then
    raise exception '% x_gate_audits rows reference an unknown workspace', orphan_workspace_count;
  end if;
end
$$ language plpgsql;

alter table public.x_gate_audits alter column audit_key set not null;
alter table public.x_gate_audits alter column id set not null;
alter table public.x_gate_audits alter column workspace_id set not null;
alter table public.x_gate_audits alter column gate_results set default '{}'::jsonb;
alter table public.x_gate_audits alter column gate_results set not null;
alter table public.x_gate_audits alter column secondary_blocking_gates set default '[]'::jsonb;
alter table public.x_gate_audits alter column secondary_blocking_gates set not null;
alter table public.x_gate_audits alter column final_eligibility set default false;
alter table public.x_gate_audits alter column final_eligibility set not null;
alter table public.x_gate_audits alter column created_at set default now();
alter table public.x_gate_audits alter column created_at set not null;

create unique index if not exists x_gate_audits_workspace_key_idx
  on public.x_gate_audits(workspace_id, audit_key);
create unique index if not exists x_gate_audits_id_uidx
  on public.x_gate_audits(id);
create unique index if not exists x_gate_audits_workspace_id_uidx
  on public.x_gate_audits(workspace_id, id);
create index if not exists x_gate_audits_workspace_run_idx
  on public.x_gate_audits(workspace_id, run_id, created_at desc);
create index if not exists x_gate_audits_workspace_created_idx
  on public.x_gate_audits(workspace_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.x_gate_audits'::regclass
       and conname = 'x_gate_audits_workspace_id_fkey'
  ) then
    alter table public.x_gate_audits
      add constraint x_gate_audits_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete restrict;
  end if;
end
$$ language plpgsql;

alter table public.x_gate_audits enable row level security;
grant select, insert, update, delete on table public.x_gate_audits to service_role;

commit;
