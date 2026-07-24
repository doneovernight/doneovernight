-- Canonical workspace-scoped execution plan.
-- Additive, idempotent, and safe to run after a partial migration.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.workspaces') is null then
    raise exception 'public.workspaces must exist before applying the daily-execution-plan migration';
  end if;
end
$$ language plpgsql;

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
  updated_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
);

alter table public.x_daily_execution_plans add column if not exists id uuid;
alter table public.x_daily_execution_plans add column if not exists workspace_id uuid;
alter table public.x_daily_execution_plans add column if not exists plan_date date;
alter table public.x_daily_execution_plans add column if not exists timezone text default 'Europe/Amsterdam';
alter table public.x_daily_execution_plans add column if not exists minimum_posts integer default 2;
alter table public.x_daily_execution_plans add column if not exists preferred_posts integer default 3;
alter table public.x_daily_execution_plans add column if not exists maximum_posts integer default 5;
alter table public.x_daily_execution_plans add column if not exists status text default 'open';
alter table public.x_daily_execution_plans add column if not exists created_at timestamptz default now();
alter table public.x_daily_execution_plans add column if not exists updated_at timestamptz default now();

alter table public.x_daily_execution_plan_items add column if not exists id uuid;
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

alter table public.x_daily_execution_plans alter column id set default gen_random_uuid();
alter table public.x_daily_execution_plan_items alter column id set default gen_random_uuid();
update public.x_daily_execution_plans set id = gen_random_uuid() where id is null;
update public.x_daily_execution_plan_items set id = gen_random_uuid() where id is null;

-- Recover partially-created rows only from their own related records. These
-- passes intentionally have no fallback/default workspace.
do $$
begin
  if to_regclass('public.x_drafts') is not null then
    update public.x_daily_execution_plan_items item
       set workspace_id = draft.workspace_id
      from public.x_drafts draft
     where item.workspace_id is null and item.draft_id = draft.id;
  end if;

  if to_regclass('public.x_topic_candidates') is not null then
    update public.x_daily_execution_plan_items item
       set workspace_id = candidate.workspace_id
      from public.x_topic_candidates candidate
     where item.workspace_id is null and item.candidate_id = candidate.id;
  end if;

  if to_regclass('public.x_autonomy_schedules') is not null then
    update public.x_daily_execution_plan_items item
       set workspace_id = schedule.workspace_id
      from public.x_autonomy_schedules schedule
     where item.workspace_id is null and item.schedule_id = schedule.id;
  end if;

  if to_regclass('public.x_publications') is not null then
    update public.x_daily_execution_plan_items item
       set workspace_id = publication.workspace_id
      from public.x_publications publication
     where item.workspace_id is null and item.publication_id = publication.id;
  end if;

  update public.x_daily_execution_plan_items item
     set workspace_id = plan.workspace_id
    from public.x_daily_execution_plans plan
   where item.workspace_id is null and item.plan_id = plan.id and plan.workspace_id is not null;

  update public.x_daily_execution_plans plan
     set workspace_id = inferred.workspace_id
    from (
      select plan_id, min(workspace_id::text)::uuid as workspace_id
        from public.x_daily_execution_plan_items
       where workspace_id is not null
       group by plan_id
      having count(distinct workspace_id) = 1
    ) inferred
   where plan.workspace_id is null and plan.id = inferred.plan_id;

  update public.x_daily_execution_plan_items item
     set workspace_id = plan.workspace_id
    from public.x_daily_execution_plans plan
   where item.workspace_id is null and item.plan_id = plan.id and plan.workspace_id is not null;
end
$$ language plpgsql;

update public.x_daily_execution_plans set timezone = 'Europe/Amsterdam' where timezone is null or btrim(timezone) = '';
update public.x_daily_execution_plans set minimum_posts = 2 where minimum_posts is null;
update public.x_daily_execution_plans set preferred_posts = 3 where preferred_posts is null;
update public.x_daily_execution_plans set maximum_posts = 5 where maximum_posts is null;
update public.x_daily_execution_plans set status = 'open' where status is null or btrim(status) = '';
update public.x_daily_execution_plans set created_at = now() where created_at is null;
update public.x_daily_execution_plans set updated_at = coalesce(created_at, now()) where updated_at is null;

update public.x_daily_execution_plan_items set analytics_status = 'pending' where analytics_status is null or btrim(analytics_status) = '';
update public.x_daily_execution_plan_items set learning_status = 'pending' where learning_status is null or btrim(learning_status) = '';
update public.x_daily_execution_plan_items set lifecycle_status = 'candidate' where lifecycle_status is null or btrim(lifecycle_status) = '';
update public.x_daily_execution_plan_items set created_at = now() where created_at is null;
update public.x_daily_execution_plan_items set updated_at = coalesce(created_at, now()) where updated_at is null;

do $$
declare
  invalid_count bigint;
begin
  select count(*) into invalid_count
    from public.x_daily_execution_plans plan
   where plan.workspace_id is null
      or plan.plan_date is null
      or not exists (select 1 from public.workspaces workspace where workspace.id = plan.workspace_id);
  if invalid_count > 0 then
    raise exception '% execution plans have an unresolved workspace or plan date', invalid_count;
  end if;

  select count(*) into invalid_count
    from public.x_daily_execution_plan_items item
    left join public.x_daily_execution_plans plan on plan.id = item.plan_id
   where item.workspace_id is null
      or item.plan_id is null
      or item.slot_number is null
      or item.slot_number < 0
      or plan.id is null
      or plan.workspace_id is distinct from item.workspace_id;
  if invalid_count > 0 then
    raise exception '% execution plan items have an unresolved or cross-workspace plan relationship', invalid_count;
  end if;
end
$$ language plpgsql;

-- Fail closed on any pre-existing cross-workspace reference. The migration
-- never rewrites a non-null workspace_id to make contradictory data fit.
do $$
declare
  relation_name text;
  reference_column text;
  mismatch_count bigint;
begin
  for relation_name, reference_column in
    select * from (values
      ('x_topic_candidates', 'candidate_id'),
      ('x_drafts', 'draft_id'),
      ('x_gate_audits', 'gate_audit_id'),
      ('x_autonomy_decisions', 'decision_id'),
      ('x_autonomy_schedules', 'schedule_id'),
      ('x_publications', 'publication_id')
    ) references_to_check(relation_name, reference_column)
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'select count(*) from public.x_daily_execution_plan_items item join public.%I referenced on referenced.id = item.%I where item.%I is not null and referenced.workspace_id is distinct from item.workspace_id',
        relation_name, reference_column, reference_column
      ) into mismatch_count;
      if mismatch_count > 0 then
        raise exception '% execution-plan % references cross workspace boundaries', mismatch_count, reference_column;
      end if;
    end if;
  end loop;
end
$$ language plpgsql;

alter table public.x_daily_execution_plans alter column id set not null;
alter table public.x_daily_execution_plans alter column workspace_id set not null;
alter table public.x_daily_execution_plans alter column plan_date set not null;
alter table public.x_daily_execution_plans alter column timezone set default 'Europe/Amsterdam';
alter table public.x_daily_execution_plans alter column timezone set not null;
alter table public.x_daily_execution_plans alter column minimum_posts set default 2;
alter table public.x_daily_execution_plans alter column minimum_posts set not null;
alter table public.x_daily_execution_plans alter column preferred_posts set default 3;
alter table public.x_daily_execution_plans alter column preferred_posts set not null;
alter table public.x_daily_execution_plans alter column maximum_posts set default 5;
alter table public.x_daily_execution_plans alter column maximum_posts set not null;
alter table public.x_daily_execution_plans alter column status set default 'open';
alter table public.x_daily_execution_plans alter column status set not null;
alter table public.x_daily_execution_plans alter column created_at set default now();
alter table public.x_daily_execution_plans alter column created_at set not null;
alter table public.x_daily_execution_plans alter column updated_at set default now();
alter table public.x_daily_execution_plans alter column updated_at set not null;

alter table public.x_daily_execution_plan_items alter column id set not null;
alter table public.x_daily_execution_plan_items alter column workspace_id set not null;
alter table public.x_daily_execution_plan_items alter column plan_id set not null;
alter table public.x_daily_execution_plan_items alter column slot_number set not null;
alter table public.x_daily_execution_plan_items alter column analytics_status set default 'pending';
alter table public.x_daily_execution_plan_items alter column analytics_status set not null;
alter table public.x_daily_execution_plan_items alter column learning_status set default 'pending';
alter table public.x_daily_execution_plan_items alter column learning_status set not null;
alter table public.x_daily_execution_plan_items alter column lifecycle_status set default 'candidate';
alter table public.x_daily_execution_plan_items alter column lifecycle_status set not null;
alter table public.x_daily_execution_plan_items alter column created_at set default now();
alter table public.x_daily_execution_plan_items alter column created_at set not null;
alter table public.x_daily_execution_plan_items alter column updated_at set default now();
alter table public.x_daily_execution_plan_items alter column updated_at set not null;

create unique index if not exists x_daily_execution_plans_workspace_date_uidx
  on public.x_daily_execution_plans(workspace_id, plan_date);
create unique index if not exists x_daily_execution_plans_id_uidx
  on public.x_daily_execution_plans(id);
create unique index if not exists x_daily_execution_plans_workspace_id_uidx
  on public.x_daily_execution_plans(workspace_id, id);
create unique index if not exists x_daily_execution_plan_items_workspace_slot_uidx
  on public.x_daily_execution_plan_items(workspace_id, plan_id, slot_number);
create unique index if not exists x_daily_execution_plan_items_id_uidx
  on public.x_daily_execution_plan_items(id);
create unique index if not exists x_daily_execution_plan_items_workspace_id_uidx
  on public.x_daily_execution_plan_items(workspace_id, id);
create unique index if not exists x_daily_execution_plan_items_workspace_draft_uidx
  on public.x_daily_execution_plan_items(workspace_id, draft_id)
  where draft_id is not null;
create unique index if not exists x_daily_execution_plan_items_workspace_schedule_uidx
  on public.x_daily_execution_plan_items(workspace_id, schedule_id)
  where schedule_id is not null;
create unique index if not exists x_daily_execution_plan_items_workspace_publication_uidx
  on public.x_daily_execution_plan_items(workspace_id, publication_id)
  where publication_id is not null;
create index if not exists x_daily_execution_plan_items_workspace_candidate_idx
  on public.x_daily_execution_plan_items(workspace_id, candidate_id)
  where candidate_id is not null;
create index if not exists x_daily_execution_plan_items_workspace_lifecycle_idx
  on public.x_daily_execution_plan_items(workspace_id, lifecycle_status, intended_at);
create index if not exists x_daily_execution_plan_items_workspace_plan_idx
  on public.x_daily_execution_plan_items(workspace_id, plan_id, slot_number);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.x_daily_execution_plans'::regclass
       and conname = 'x_daily_execution_plans_workspace_id_fkey'
  ) then
    alter table public.x_daily_execution_plans
      add constraint x_daily_execution_plans_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.x_daily_execution_plan_items'::regclass
       and conname = 'x_daily_execution_plan_items_workspace_plan_fkey'
  ) then
    alter table public.x_daily_execution_plan_items
      add constraint x_daily_execution_plan_items_workspace_plan_fkey
      foreign key (workspace_id, plan_id)
      references public.x_daily_execution_plans(workspace_id, id) not valid;
  end if;
end
$$ language plpgsql;

-- Add tenant-safe composite foreign keys for every optional lifecycle link.
do $$
declare
  relation_name text;
  reference_column text;
  constraint_name text;
  reference_index_name text;
begin
  for relation_name, reference_column, constraint_name, reference_index_name in
    select * from (values
      ('x_topic_candidates', 'candidate_id', 'x_daily_execution_plan_items_workspace_candidate_fkey', 'x_topic_candidates_workspace_id_uidx'),
      ('x_drafts', 'draft_id', 'x_daily_execution_plan_items_workspace_draft_fkey', 'x_drafts_workspace_id_uidx'),
      ('x_gate_audits', 'gate_audit_id', 'x_daily_execution_plan_items_workspace_gate_audit_fkey', 'x_gate_audits_workspace_id_uidx'),
      ('x_autonomy_decisions', 'decision_id', 'x_daily_execution_plan_items_workspace_decision_fkey', 'x_autonomy_decisions_workspace_id_uidx'),
      ('x_autonomy_schedules', 'schedule_id', 'x_daily_execution_plan_items_workspace_schedule_fkey', 'x_autonomy_schedules_workspace_id_uidx'),
      ('x_publications', 'publication_id', 'x_daily_execution_plan_items_workspace_publication_fkey', 'x_publications_workspace_id_uidx')
    ) lifecycle_links(relation_name, reference_column, constraint_name, reference_index_name)
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'create unique index if not exists %I on public.%I(workspace_id, id)',
        reference_index_name, relation_name
      );
      if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.x_daily_execution_plan_items'::regclass
           and conname = constraint_name
      ) then
        execute format(
          'alter table public.x_daily_execution_plan_items add constraint %I foreign key (workspace_id, %I) references public.%I(workspace_id, id) not valid',
          constraint_name, reference_column, relation_name
        );
      end if;
    end if;
  end loop;
end
$$ language plpgsql;

alter table public.x_daily_execution_plans enable row level security;
alter table public.x_daily_execution_plan_items enable row level security;
grant select, insert, update, delete on table public.x_daily_execution_plans, public.x_daily_execution_plan_items to service_role;

-- Add the canonical schedule link without changing existing schedule rows.
do $$
begin
  if to_regclass('public.x_autonomy_schedules') is not null then
    alter table public.x_autonomy_schedules
      add column if not exists execution_plan_item_id uuid;

    create unique index if not exists x_autonomy_schedules_workspace_plan_item_uidx
      on public.x_autonomy_schedules(workspace_id, execution_plan_item_id)
      where execution_plan_item_id is not null;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.x_autonomy_schedules'::regclass
         and conname = 'x_autonomy_schedules_workspace_plan_item_fkey'
    ) then
      alter table public.x_autonomy_schedules
        add constraint x_autonomy_schedules_workspace_plan_item_fkey
        foreign key (workspace_id, execution_plan_item_id)
        references public.x_daily_execution_plan_items(workspace_id, id) not valid;
    end if;
  end if;
end
$$ language plpgsql;

-- Seed every represented workspace/date. Dates use the workspace timezone,
-- never a hard-coded tenant or a cross-tenant source row.
do $$
begin
  if to_regclass('public.x_topic_candidates') is not null then
    insert into public.x_daily_execution_plans
      (workspace_id, plan_date, timezone, minimum_posts, preferred_posts, maximum_posts)
    select distinct candidate.workspace_id,
      (candidate.created_at at time zone coalesce(workspace.timezone, 'Europe/Amsterdam'))::date,
      coalesce(workspace.timezone, 'Europe/Amsterdam'), 2, 3, 5
      from public.x_topic_candidates candidate
      join public.workspaces workspace on workspace.id = candidate.workspace_id
     where candidate.created_at is not null
    on conflict do nothing;
  end if;

  if to_regclass('public.x_drafts') is not null then
    insert into public.x_daily_execution_plans
      (workspace_id, plan_date, timezone, minimum_posts, preferred_posts, maximum_posts)
    select distinct draft.workspace_id,
      (draft.created_at at time zone coalesce(workspace.timezone, 'Europe/Amsterdam'))::date,
      coalesce(workspace.timezone, 'Europe/Amsterdam'), 2, 3, 5
      from public.x_drafts draft
      join public.workspaces workspace on workspace.id = draft.workspace_id
     where draft.created_at is not null
    on conflict do nothing;
  end if;

  if to_regclass('public.x_autonomy_schedules') is not null then
    insert into public.x_daily_execution_plans
      (workspace_id, plan_date, timezone, minimum_posts, preferred_posts, maximum_posts)
    select distinct schedule.workspace_id,
      (schedule.scheduled_for at time zone coalesce(workspace.timezone, 'Europe/Amsterdam'))::date,
      coalesce(workspace.timezone, 'Europe/Amsterdam'), 2, 3, 5
      from public.x_autonomy_schedules schedule
      join public.workspaces workspace on workspace.id = schedule.workspace_id
     where schedule.scheduled_for is not null
    on conflict do nothing;
  end if;

  if to_regclass('public.x_publications') is not null then
    insert into public.x_daily_execution_plans
      (workspace_id, plan_date, timezone, minimum_posts, preferred_posts, maximum_posts)
    select distinct publication.workspace_id,
      (coalesce(publication.published_at, publication.attempted_at) at time zone coalesce(workspace.timezone, 'Europe/Amsterdam'))::date,
      coalesce(workspace.timezone, 'Europe/Amsterdam'), 2, 3, 5
      from public.x_publications publication
      join public.workspaces workspace on workspace.id = publication.workspace_id
     where coalesce(publication.published_at, publication.attempted_at) is not null
    on conflict do nothing;
  end if;
end
$$ language plpgsql;

-- Backfill one canonical item per existing draft. All lateral lookups are
-- constrained by workspace_id, so identically-shaped tenants cannot cross-link.
do $$
begin
  if to_regclass('public.x_drafts') is not null
     and to_regclass('public.x_autonomy_schedules') is not null
     and to_regclass('public.x_publications') is not null
     and to_regclass('public.x_gate_audits') is not null
     and to_regclass('public.x_autonomy_decisions') is not null then
    with draft_links as (
      select draft.workspace_id,
             draft.id as draft_id,
             draft.candidate_id,
             draft.created_at,
             schedule.id as schedule_id,
             schedule.scheduled_for,
             schedule.status as schedule_status,
             publication.id as publication_id,
             publication.published_at,
             publication.status as publication_status,
             gate.id as gate_audit_id,
             decision.id as decision_id
        from public.x_drafts draft
        left join lateral (
          select schedule_row.id, schedule_row.scheduled_for, schedule_row.status
            from public.x_autonomy_schedules schedule_row
           where schedule_row.workspace_id = draft.workspace_id
             and schedule_row.draft_id = draft.id
           order by schedule_row.scheduled_for desc nulls last, schedule_row.created_at desc
           limit 1
        ) schedule on true
        left join lateral (
          select publication_row.id, publication_row.published_at, publication_row.status
            from public.x_publications publication_row
           where publication_row.workspace_id = draft.workspace_id
             and publication_row.draft_id = draft.id
           order by publication_row.published_at desc nulls last, publication_row.attempted_at desc
           limit 1
        ) publication on true
        left join lateral (
          select gate_row.id
            from public.x_gate_audits gate_row
           where gate_row.workspace_id = draft.workspace_id
             and gate_row.draft_id = draft.id::text
           order by gate_row.created_at desc
           limit 1
        ) gate on true
        left join lateral (
          select decision_row.id
            from public.x_autonomy_decisions decision_row
           where decision_row.workspace_id = draft.workspace_id
             and decision_row.draft_id = draft.id
           order by decision_row.created_at desc
           limit 1
        ) decision on true
    ), numbered as (
      select links.*,
             plan.id as plan_id,
             coalesce(
               (select max(existing.slot_number)
                  from public.x_daily_execution_plan_items existing
                 where existing.workspace_id = links.workspace_id and existing.plan_id = plan.id),
               -1
             ) + row_number() over (partition by plan.id order by links.created_at, links.draft_id) as slot_number
        from draft_links links
        join public.x_daily_execution_plans plan
          on plan.workspace_id = links.workspace_id
         and plan.plan_date = (
           coalesce(links.published_at, links.scheduled_for, links.created_at)
           at time zone plan.timezone
         )::date
       where not exists (
         select 1 from public.x_daily_execution_plan_items existing
          where existing.workspace_id = links.workspace_id and existing.draft_id = links.draft_id
       )
    )
    insert into public.x_daily_execution_plan_items
      (workspace_id, plan_id, slot_number, intended_at, candidate_id, draft_id,
       gate_audit_id, decision_id, schedule_id, publication_id, lifecycle_status)
    select workspace_id, plan_id, slot_number::integer,
           coalesce(published_at, scheduled_for, created_at), candidate_id, draft_id,
           gate_audit_id, decision_id, schedule_id, publication_id,
           case when publication_id is not null and publication_status = 'published' then 'published'
                when schedule_id is not null and schedule_status in ('scheduled', 'due', 'delayed') then 'scheduled'
                when schedule_id is not null and schedule_status = 'publishing' then 'publishing'
                when schedule_id is not null and schedule_status = 'failed' then 'failed'
                when schedule_id is not null and schedule_status = 'shadow' then 'evaluated'
                when schedule_id is not null and schedule_status in ('canceled', 'cancelled', 'missed', 'superseded', 'published') then 'blocked'
                when schedule_id is not null then 'blocked'
                when gate_audit_id is not null then 'evaluated'
                else 'drafted' end
      from numbered
    on conflict (workspace_id, draft_id) where draft_id is not null do nothing;

    update public.x_daily_execution_plan_items item
       set candidate_id = coalesce(item.candidate_id, draft.candidate_id),
           updated_at = now()
      from public.x_drafts draft
     where item.workspace_id = draft.workspace_id and item.draft_id = draft.id;
  end if;
end
$$ language plpgsql;

-- Reconcile lifecycle links for already-present items without changing their
-- owning workspace or historical identifiers.
do $$
begin
  if to_regclass('public.x_gate_audits') is not null then
    update public.x_daily_execution_plan_items item
       set gate_audit_id = (
             select gate_row.id
               from public.x_gate_audits gate_row
              where gate_row.workspace_id = item.workspace_id
                and gate_row.draft_id = item.draft_id::text
              order by gate_row.created_at desc
              limit 1
           ),
           updated_at = now()
     where item.draft_id is not null
       and item.gate_audit_id is null
       and exists (
         select 1 from public.x_gate_audits gate_row
          where gate_row.workspace_id = item.workspace_id
            and gate_row.draft_id = item.draft_id::text
       );
  end if;

  if to_regclass('public.x_autonomy_decisions') is not null then
    update public.x_daily_execution_plan_items item
       set decision_id = (
             select decision_row.id
               from public.x_autonomy_decisions decision_row
              where decision_row.workspace_id = item.workspace_id
                and decision_row.draft_id = item.draft_id
              order by decision_row.created_at desc
              limit 1
           ),
           updated_at = now()
     where item.draft_id is not null
       and item.decision_id is null
       and exists (
         select 1 from public.x_autonomy_decisions decision_row
          where decision_row.workspace_id = item.workspace_id
            and decision_row.draft_id = item.draft_id
       );
  end if;

  if to_regclass('public.x_autonomy_schedules') is not null then
    update public.x_daily_execution_plan_items item
       set schedule_id = schedule.id,
           intended_at = coalesce(item.intended_at, schedule.scheduled_for),
           lifecycle_status = case
             when schedule.status in ('scheduled', 'due', 'delayed') then 'scheduled'
             when schedule.status = 'publishing' then 'publishing'
             when schedule.status = 'failed' then 'failed'
             when schedule.status = 'shadow' then 'evaluated'
             when schedule.status in ('canceled', 'cancelled', 'missed', 'superseded', 'published') then 'blocked'
             else 'blocked'
           end,
           updated_at = now()
      from public.x_autonomy_schedules schedule
     where item.draft_id is not null
       and schedule.workspace_id = item.workspace_id
       and schedule.draft_id = item.draft_id;
  end if;

  if to_regclass('public.x_publications') is not null then
    update public.x_daily_execution_plan_items item
       set publication_id = publication.id,
           actual_published_at = coalesce(item.actual_published_at, publication.published_at),
           lifecycle_status = case when publication.status = 'published' then 'published' else item.lifecycle_status end,
           updated_at = now()
      from public.x_publications publication
     where publication.workspace_id = item.workspace_id
       and publication.draft_id = item.draft_id
       and item.draft_id is not null;
  end if;

  if to_regclass('public.x_autonomy_schedules') is not null then
    update public.x_autonomy_schedules schedule
       set execution_plan_item_id = item.id
      from public.x_daily_execution_plan_items item
     where item.workspace_id = schedule.workspace_id
       and item.schedule_id = schedule.id
       and schedule.execution_plan_item_id is null;
  end if;
end
$$ language plpgsql;

do $$
declare
  detached_schedule_count bigint;
begin
  if to_regclass('public.x_autonomy_schedules') is not null then
    select count(*) into detached_schedule_count
      from public.x_autonomy_schedules
     where execution_plan_item_id is null;
    if detached_schedule_count > 0 then
      raise exception '% autonomy schedules could not be linked to a tenant-safe execution-plan item', detached_schedule_count;
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.x_autonomy_schedules'::regclass
         and conname = 'x_autonomy_schedules_plan_item_required'
    ) then
      alter table public.x_autonomy_schedules
        add constraint x_autonomy_schedules_plan_item_required
        check (execution_plan_item_id is not null) not valid;
    end if;
  end if;
end
$$ language plpgsql;

commit;
