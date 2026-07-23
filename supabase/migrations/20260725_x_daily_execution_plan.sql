-- Canonical workspace-scoped execution plan.
-- Additive, idempotent, and safe to run after a partial migration.

begin;

create extension if not exists pgcrypto;

create table if not exists public.x_daily_execution_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_date date not null,
  timezone text not null default 'Europe/Amsterdam',
  minimum_posts integer not null default 2,
  preferred_posts integer not null default 3,
  maximum_posts integer not null default 5,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, plan_date)
);

create table if not exists public.x_daily_execution_plan_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  slot_number integer not null,
  intended_at timestamptz,
  candidate_id uuid,
  draft_id uuid,
  gate_audit_id uuid,
  decision_id uuid,
  schedule_id uuid,
  publication_id uuid,
  analytics_status text not null default 'pending',
  learning_status text not null default 'pending',
  lifecycle_status text not null default 'candidate',
  blocker_code text,
  blocker_reason text,
  recovery_action text,
  actual_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, plan_id, slot_number)
);

alter table public.x_daily_execution_plans add column if not exists workspace_id uuid;
alter table public.x_daily_execution_plans add column if not exists plan_date date;
alter table public.x_daily_execution_plans add column if not exists timezone text default 'Europe/Amsterdam';
alter table public.x_daily_execution_plans add column if not exists minimum_posts integer default 2;
alter table public.x_daily_execution_plans add column if not exists preferred_posts integer default 3;
alter table public.x_daily_execution_plans add column if not exists maximum_posts integer default 5;
alter table public.x_daily_execution_plans add column if not exists status text default 'open';
alter table public.x_daily_execution_plans add column if not exists created_at timestamptz default now();
alter table public.x_daily_execution_plans add column if not exists updated_at timestamptz default now();

alter table public.x_daily_execution_plan_items add column if not exists workspace_id uuid;
alter table public.x_daily_execution_plan_items add column if not exists plan_id uuid;
alter table public.x_daily_execution_plan_items add column if not exists slot_number integer;
alter table public.x_daily_execution_plan_items add column if not exists intended_at timestamptz;
alter table public.x_daily_execution_plan_items add column if not exists candidate_id uuid;
alter table public.x_daily_execution_plan_items add column if not exists draft_id uuid;
alter table public.x_daily_execution_plan_items add column if not exists gate_audit_id uuid;
alter table public.x_daily_execution_plan_items add column if not exists decision_id uuid;
alter table public.x_daily_execution_plan_items add column if not exists schedule_id uuid;
alter table public.x_daily_execution_plan_items add column if not exists publication_id uuid;
alter table public.x_daily_execution_plan_items add column if not exists analytics_status text default 'pending';
alter table public.x_daily_execution_plan_items add column if not exists learning_status text default 'pending';
alter table public.x_daily_execution_plan_items add column if not exists lifecycle_status text default 'candidate';
alter table public.x_daily_execution_plan_items add column if not exists blocker_code text;
alter table public.x_daily_execution_plan_items add column if not exists blocker_reason text;
alter table public.x_daily_execution_plan_items add column if not exists recovery_action text;
alter table public.x_daily_execution_plan_items add column if not exists actual_published_at timestamptz;
alter table public.x_daily_execution_plan_items add column if not exists created_at timestamptz default now();
alter table public.x_daily_execution_plan_items add column if not exists updated_at timestamptz default now();

create unique index if not exists x_daily_execution_plans_workspace_date_uidx
  on public.x_daily_execution_plans(workspace_id, plan_date);
create unique index if not exists x_daily_execution_plan_items_workspace_slot_uidx
  on public.x_daily_execution_plan_items(workspace_id, plan_id, slot_number);
create unique index if not exists x_daily_execution_plan_items_workspace_draft_uidx
  on public.x_daily_execution_plan_items(workspace_id, draft_id)
  where draft_id is not null;
create unique index if not exists x_daily_execution_plan_items_workspace_schedule_uidx
  on public.x_daily_execution_plan_items(workspace_id, schedule_id)
  where schedule_id is not null;
create index if not exists x_daily_execution_plan_items_workspace_lifecycle_idx
  on public.x_daily_execution_plan_items(workspace_id, lifecycle_status, intended_at);
create index if not exists x_daily_execution_plan_items_workspace_plan_idx
  on public.x_daily_execution_plan_items(workspace_id, plan_id, slot_number);

alter table public.x_daily_execution_plans enable row level security;
alter table public.x_daily_execution_plan_items enable row level security;
grant select, insert, update, delete on table public.x_daily_execution_plans, public.x_daily_execution_plan_items to service_role;

-- Foreign keys are added as NOT VALID so historical orphaned IDs remain intact;
-- new writes are still checked and the links can be validated after reconciliation.
do $$
begin
  if to_regclass('public.workspaces') is not null and not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plans_workspace_fkey') then
    alter table public.x_daily_execution_plans add constraint x_daily_execution_plans_workspace_fkey foreign key (workspace_id) references public.workspaces(id) not valid;
  end if;
  if to_regclass('public.workspaces') is not null and not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plan_items_workspace_fkey') then
    alter table public.x_daily_execution_plan_items add constraint x_daily_execution_plan_items_workspace_fkey foreign key (workspace_id) references public.workspaces(id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plan_items_plan_fkey') then
    alter table public.x_daily_execution_plan_items add constraint x_daily_execution_plan_items_plan_fkey foreign key (plan_id) references public.x_daily_execution_plans(id) not valid;
  end if;
  if to_regclass('public.x_topic_candidates') is not null and not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plan_items_candidate_fkey') then
    alter table public.x_daily_execution_plan_items add constraint x_daily_execution_plan_items_candidate_fkey foreign key (candidate_id) references public.x_topic_candidates(id) not valid;
  end if;
  if to_regclass('public.x_drafts') is not null and not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plan_items_draft_fkey') then
    alter table public.x_daily_execution_plan_items add constraint x_daily_execution_plan_items_draft_fkey foreign key (draft_id) references public.x_drafts(id) not valid;
  end if;
  if to_regclass('public.x_gate_audits') is not null and not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plan_items_gate_audit_fkey') then
    alter table public.x_daily_execution_plan_items add constraint x_daily_execution_plan_items_gate_audit_fkey foreign key (gate_audit_id) references public.x_gate_audits(id) not valid;
  end if;
  if to_regclass('public.x_autonomy_decisions') is not null and not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plan_items_decision_fkey') then
    alter table public.x_daily_execution_plan_items add constraint x_daily_execution_plan_items_decision_fkey foreign key (decision_id) references public.x_autonomy_decisions(id) not valid;
  end if;
  if to_regclass('public.x_autonomy_schedules') is not null and not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plan_items_schedule_fkey') then
    alter table public.x_daily_execution_plan_items add constraint x_daily_execution_plan_items_schedule_fkey foreign key (schedule_id) references public.x_autonomy_schedules(id) not valid;
  end if;
  if to_regclass('public.x_publications') is not null and not exists (select 1 from pg_constraint where conname = 'x_daily_execution_plan_items_publication_fkey') then
    alter table public.x_daily_execution_plan_items add constraint x_daily_execution_plan_items_publication_fkey foreign key (publication_id) references public.x_publications(id) not valid;
  end if;
end $$ language plpgsql;

-- Add the canonical schedule link without changing existing schedules.
do $$
begin
  if to_regclass('public.x_autonomy_schedules') is not null then
    execute 'alter table public.x_autonomy_schedules add column if not exists execution_plan_item_id uuid';
    if not exists (select 1 from pg_constraint where conname = 'x_autonomy_schedules_execution_plan_item_fkey') then
      execute 'alter table public.x_autonomy_schedules add constraint x_autonomy_schedules_execution_plan_item_fkey foreign key (execution_plan_item_id) references public.x_daily_execution_plan_items(id) not valid';
    end if;
    execute 'create unique index if not exists x_autonomy_schedules_workspace_plan_item_uidx on public.x_autonomy_schedules(workspace_id, execution_plan_item_id) where execution_plan_item_id is not null';
  end if;
end $$ language plpgsql;

-- Seed plans for all dates already represented by drafts, schedules, or publications.
do $$
declare
  seeded_workspace uuid;
begin
  select id into seeded_workspace from public.workspaces where slug = 'x-automatic-poster' order by created_at limit 1;
  if seeded_workspace is not null then
    if to_regclass('public.x_drafts') is not null then
      execute $sql$ insert into public.x_daily_execution_plans (workspace_id, plan_date, timezone, minimum_posts, preferred_posts, maximum_posts)
        select $1, (created_at at time zone 'Europe/Amsterdam')::date, 'Europe/Amsterdam', 2, 3, 5
        from public.x_drafts where created_at is not null
        on conflict (workspace_id, plan_date) do nothing $sql$ using seeded_workspace;
    end if;
    if to_regclass('public.x_autonomy_schedules') is not null then
      execute $sql$ insert into public.x_daily_execution_plans (workspace_id, plan_date, timezone, minimum_posts, preferred_posts, maximum_posts)
        select $1, (scheduled_for at time zone 'Europe/Amsterdam')::date, 'Europe/Amsterdam', 2, 3, 5
        from public.x_autonomy_schedules where scheduled_for is not null
        on conflict (workspace_id, plan_date) do nothing $sql$ using seeded_workspace;
    end if;
    if to_regclass('public.x_publications') is not null then
      execute $sql$ insert into public.x_daily_execution_plans (workspace_id, plan_date, timezone, minimum_posts, preferred_posts, maximum_posts)
        select $1, (published_at at time zone 'Europe/Amsterdam')::date, 'Europe/Amsterdam', 2, 3, 5
        from public.x_publications where published_at is not null
        on conflict (workspace_id, plan_date) do nothing $sql$ using seeded_workspace;
    end if;
  end if;
end $$ language plpgsql;

-- Deterministically backfill draft-centric plan items and link existing records.
do $$
declare
  seeded_workspace uuid;
begin
  select id into seeded_workspace from public.workspaces where slug = 'x-automatic-poster' order by created_at limit 1;
  if seeded_workspace is not null and to_regclass('public.x_drafts') is not null and to_regclass('public.x_topic_candidates') is not null
     and to_regclass('public.x_gate_audits') is not null and to_regclass('public.x_autonomy_decisions') is not null
     and to_regclass('public.x_autonomy_schedules') is not null and to_regclass('public.x_publications') is not null
     and to_regclass('public.x_post_analytics') is not null and to_regclass('public.x_post_performance_memory') is not null then
    insert into public.x_daily_execution_plan_items (workspace_id, plan_id, slot_number, intended_at, candidate_id, draft_id, gate_audit_id, decision_id, schedule_id, publication_id, lifecycle_status, analytics_status, learning_status)
    select seeded_workspace, plan.id,
      row_number() over (partition by plan.id order by draft.created_at, draft.id)::integer,
      coalesce(schedule.scheduled_for, draft.created_at), draft.candidate_id, draft.id,
      gate.id, decision.id, schedule.id, publication.id,
      case when publication.id is not null and publication.status = 'published' then 'published'
           when schedule.id is not null and schedule.status in ('scheduled','due','publishing','delayed') then 'scheduled'
           when gate.id is not null and gate.final_eligibility then 'evaluated'
           else 'drafted' end,
      case when analytics.id is not null then 'complete' else 'pending' end,
      case when memory.id is not null then 'complete' else 'pending' end
    from public.x_drafts draft
    join public.x_daily_execution_plans plan on plan.workspace_id = seeded_workspace and plan.plan_date = (draft.created_at at time zone 'Europe/Amsterdam')::date
    left join lateral (select * from public.x_gate_audits g where g.draft_id = draft.id::text order by g.created_at desc limit 1) gate on true
    left join lateral (select * from public.x_autonomy_decisions d where d.draft_id = draft.id order by d.created_at desc limit 1) decision on true
    left join lateral (select * from public.x_autonomy_schedules s where s.draft_id = draft.id order by s.scheduled_for desc nulls last limit 1) schedule on true
    left join lateral (select * from public.x_publications p where p.draft_id = draft.id order by p.attempted_at desc limit 1) publication on true
    left join lateral (select * from public.x_post_analytics a where a.publication_id = publication.id order by a.recorded_at desc limit 1) analytics on true
    left join lateral (select * from public.x_post_performance_memory m where m.publication_id = publication.id limit 1) memory on true
    on conflict do nothing;

    insert into public.x_daily_execution_plan_items (workspace_id, plan_id, slot_number, intended_at, candidate_id, lifecycle_status)
    select seeded_workspace, plan.id,
      (coalesce((select max(slot_number) from public.x_daily_execution_plan_items i where i.plan_id = plan.id), 0) + row_number() over (partition by plan.id order by candidate.created_at, candidate.id))::integer,
      candidate.created_at, candidate.id, 'candidate'
    from public.x_topic_candidates candidate
    join public.x_daily_execution_plans plan on plan.workspace_id = seeded_workspace and plan.plan_date = (candidate.created_at at time zone 'Europe/Amsterdam')::date
    where not exists (select 1 from public.x_daily_execution_plan_items i where i.workspace_id = seeded_workspace and i.candidate_id = candidate.id);
  end if;
end $$ language plpgsql;

do $$
begin
  if to_regclass('public.x_autonomy_schedules') is not null then
    update public.x_autonomy_schedules s
    set execution_plan_item_id = i.id
    from public.x_daily_execution_plan_items i
    where i.schedule_id = s.id and s.execution_plan_item_id is null;
    if not exists (select 1 from pg_constraint where conname = 'x_autonomy_schedules_plan_item_required') then
      alter table public.x_autonomy_schedules add constraint x_autonomy_schedules_plan_item_required check (execution_plan_item_id is not null) not valid;
    end if;
  end if;
end $$ language plpgsql;

commit;
