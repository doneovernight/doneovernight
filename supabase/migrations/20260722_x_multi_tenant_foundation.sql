-- DONEOVERNIGHT X Content Agent Phase 1 tenant foundation.
-- Additive, idempotent, and intentionally does not move or create live tokens.
-- The seeded workspace is the only compatibility workspace until Phase 2.

begin;

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  timezone text not null default 'Europe/Amsterdam',
  locale text not null default 'en',
  plan text not null default 'starter',
  autonomy_mode text not null default 'shadow' check (autonomy_mode in ('off', 'shadow', 'auto')),
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'analyst', 'viewer', 'operator')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (workspace_id, user_id)
);

create table if not exists public.x_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  x_user_id text not null,
  username text not null,
  display_name text,
  profile_image_url text,
  auth_status text not null default 'pending' check (auth_status in ('pending', 'connected', 'degraded', 'revoked', 'disconnected')),
  connected_at timestamptz,
  last_verified_at timestamptz,
  unique (workspace_id, x_user_id),
  unique (workspace_id, username)
);

create table if not exists public.workspace_operator_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  reason text not null
);

insert into public.organizations (id, name, slug, status)
values ('00000000-0000-4000-8000-000000000001', 'DONEOVERNIGHT', 'doneovernight', 'active')
on conflict (slug) do nothing;

insert into public.workspaces (id, organization_id, name, slug, status, timezone, locale, plan, autonomy_mode)
values (
  '00000000-0000-4000-8000-000000000002',
  (select id from public.organizations where slug = 'doneovernight'),
  'X Automatic Poster', 'x-automatic-poster', 'active', 'Europe/Amsterdam', 'en', 'starter', 'shadow'
)
on conflict (organization_id, slug) do nothing;

insert into public.x_accounts (workspace_id, x_user_id, username, auth_status)
select id, '2037306333813235713', 'doneovernight', 'connected'
from public.workspaces
where slug = 'x-automatic-poster'
on conflict (workspace_id, username) do nothing;

do $$
begin
  if (select id from public.organizations where slug = 'doneovernight') <> '00000000-0000-4000-8000-000000000001'::uuid
     or (select id from public.workspaces where slug = 'x-automatic-poster') <> '00000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'Seed tenant identifiers do not match the Phase 1 compatibility contract';
  end if;
end $$;

do $$
declare
  table_name text;
  required_tables text[] := array[
    'x_sources', 'x_topic_candidates', 'x_drafts', 'x_publications', 'x_agent_runs', 'x_settings',
    'x_reply_inbox', 'x_reply_drafts', 'x_post_analytics', 'x_radar_items', 'x_social_evidence',
    'x_editorial_objects', 'x_editorial_adaptations', 'x_social_pattern_observations',
    'x_source_controls', 'x_telegram_control_events', 'x_editor_feedback', 'x_editor_profiles',
    'x_draft_learning_metadata', 'x_post_performance_memory', 'x_learning_reports',
    'x_growth_strategy_snapshots', 'x_growth_decisions', 'x_growth_daily_briefs', 'x_growth_reports',
    'x_growth_intelligence_memory', 'x_account_health_snapshots', 'x_competitor_observations',
    'x_growth_gaps', 'x_growth_series', 'x_growth_calendar_entries', 'x_growth_experiments',
    'x_growth_executive_reports', 'x_account_activity', 'x_autonomy_decisions',
    'x_autonomy_schedules', 'x_metric_checkpoints', 'x_learning_versions', 'x_autonomy_audit_events'
  ];
begin
  foreach table_name in array required_tables loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Phase 1 tenant migration requires missing live table public.%', table_name;
    end if;
  end loop;
end $$;

-- x_settings historically used key as its primary key. Give it a stable row ID
-- so the setting key can become workspace-scoped without losing any rows.
alter table public.x_settings add column if not exists id uuid;
update public.x_settings set id = gen_random_uuid() where id is null;
alter table public.x_settings alter column id set default gen_random_uuid();
alter table public.x_settings alter column id set not null;
alter table public.x_settings drop constraint if exists x_settings_pkey;
alter table public.x_settings add constraint x_settings_pkey primary key (id);

do $$
declare
  table_name text;
  workspace_id uuid := (select id from public.workspaces where slug = 'x-automatic-poster');
  scoped_tables text[] := array[
    'x_sources', 'x_topic_candidates', 'x_drafts', 'x_publications', 'x_agent_runs', 'x_settings',
    'x_reply_inbox', 'x_reply_drafts', 'x_post_analytics', 'x_radar_items', 'x_social_evidence',
    'x_editorial_objects', 'x_editorial_adaptations', 'x_social_pattern_observations',
    'x_source_controls', 'x_telegram_control_events', 'x_editor_feedback', 'x_editor_profiles',
    'x_draft_learning_metadata', 'x_post_performance_memory', 'x_learning_reports',
    'x_growth_strategy_snapshots', 'x_growth_decisions', 'x_growth_daily_briefs', 'x_growth_reports',
    'x_growth_intelligence_memory', 'x_account_health_snapshots', 'x_competitor_observations',
    'x_growth_gaps', 'x_growth_series', 'x_growth_calendar_entries', 'x_growth_experiments',
    'x_growth_executive_reports', 'x_account_activity', 'x_autonomy_decisions',
    'x_autonomy_schedules', 'x_metric_checkpoints', 'x_learning_versions', 'x_autonomy_audit_events'
  ];
begin
  if workspace_id is null then raise exception 'Seed workspace was not created'; end if;
  foreach table_name in array scoped_tables loop
    execute format('alter table public.%I add column if not exists workspace_id uuid', table_name);
    execute format('update public.%I set workspace_id = $1 where workspace_id is null', table_name) using workspace_id;
    execute format('alter table public.%I alter column workspace_id set not null', table_name);
  end loop;
end $$;

-- Replace global natural-key uniqueness with workspace-scoped uniqueness.
alter table public.x_sources drop constraint if exists x_sources_source_url_key;
alter table public.x_topic_candidates drop constraint if exists x_topic_candidates_source_url_key;
alter table public.x_source_controls drop constraint if exists x_source_controls_source_id_key;
alter table public.x_editor_profiles drop constraint if exists x_editor_profiles_profile_key_key;
alter table public.x_draft_learning_metadata drop constraint if exists x_draft_learning_metadata_draft_id_key;
alter table public.x_learning_reports drop constraint if exists x_learning_reports_week_start_key;
alter table public.x_growth_strategy_snapshots drop constraint if exists x_growth_strategy_snapshots_snapshot_key_key;
alter table public.x_growth_decisions drop constraint if exists x_growth_decisions_decision_key_key;
alter table public.x_growth_daily_briefs drop constraint if exists x_growth_daily_briefs_brief_date_key;
alter table public.x_growth_reports drop constraint if exists x_growth_reports_period_type_period_start_key;
alter table public.x_competitor_observations drop constraint if exists x_competitor_observations_source_name_source_url_key;
alter table public.x_growth_gaps drop constraint if exists x_growth_gaps_gap_key_key;
alter table public.x_growth_series drop constraint if exists x_growth_series_series_key_key;
alter table public.x_growth_calendar_entries drop constraint if exists x_growth_calendar_entries_calendar_key_key;
alter table public.x_growth_experiments drop constraint if exists x_growth_experiments_experiment_key_key;
alter table public.x_growth_executive_reports drop constraint if exists x_growth_executive_reports_period_start_key;
alter table public.x_radar_items drop constraint if exists x_radar_items_source_url_key;
alter table public.x_telegram_control_events drop constraint if exists x_telegram_control_events_callback_token_key;

drop index if exists public.x_post_analytics_post_snapshot_key_idx;
drop index if exists public.x_post_performance_memory_x_post_id_idx;

create unique index if not exists x_sources_workspace_source_url_uidx on public.x_sources(workspace_id, source_url);
create unique index if not exists x_topic_candidates_workspace_source_url_uidx on public.x_topic_candidates(workspace_id, source_url);
create unique index if not exists x_settings_workspace_key_uidx on public.x_settings(workspace_id, key);
create unique index if not exists x_source_controls_workspace_source_uidx on public.x_source_controls(workspace_id, source_id);
create unique index if not exists x_editor_profiles_workspace_profile_uidx on public.x_editor_profiles(workspace_id, profile_key);
create unique index if not exists x_draft_learning_workspace_draft_uidx on public.x_draft_learning_metadata(workspace_id, draft_id);
create unique index if not exists x_learning_reports_workspace_week_uidx on public.x_learning_reports(workspace_id, week_start);
create unique index if not exists x_growth_strategy_workspace_key_uidx on public.x_growth_strategy_snapshots(workspace_id, snapshot_key);
create unique index if not exists x_growth_decisions_workspace_key_uidx on public.x_growth_decisions(workspace_id, decision_key);
create unique index if not exists x_growth_daily_workspace_date_uidx on public.x_growth_daily_briefs(workspace_id, brief_date);
create unique index if not exists x_growth_reports_workspace_period_uidx on public.x_growth_reports(workspace_id, period_type, period_start);
create unique index if not exists x_competitor_workspace_source_uidx on public.x_competitor_observations(workspace_id, source_name, source_url);
create unique index if not exists x_growth_gaps_workspace_key_uidx on public.x_growth_gaps(workspace_id, gap_key);
create unique index if not exists x_growth_series_workspace_key_uidx on public.x_growth_series(workspace_id, series_key);
create unique index if not exists x_growth_calendar_workspace_key_uidx on public.x_growth_calendar_entries(workspace_id, calendar_key);
create unique index if not exists x_growth_experiments_workspace_key_uidx on public.x_growth_experiments(workspace_id, experiment_key);
create unique index if not exists x_growth_executive_workspace_period_uidx on public.x_growth_executive_reports(workspace_id, period_start);
create unique index if not exists x_radar_workspace_source_uidx on public.x_radar_items(workspace_id, source_url);
create unique index if not exists x_telegram_workspace_token_uidx on public.x_telegram_control_events(workspace_id, callback_token);
create unique index if not exists x_reply_inbox_workspace_event_uidx on public.x_reply_inbox(workspace_id, x_event_id);
create unique index if not exists x_publications_workspace_draft_uidx on public.x_publications(workspace_id, draft_id);
create unique index if not exists x_editorial_adaptations_workspace_platform_uidx on public.x_editorial_adaptations(workspace_id, editorial_object_id, platform);
create unique index if not exists x_autonomy_decisions_workspace_key_uidx on public.x_autonomy_decisions(workspace_id, decision_key);
create unique index if not exists x_autonomy_schedules_workspace_draft_uidx on public.x_autonomy_schedules(workspace_id, draft_id);
create unique index if not exists x_metric_checkpoints_workspace_checkpoint_uidx on public.x_metric_checkpoints(workspace_id, publication_id, checkpoint_hours);
create unique index if not exists x_account_activity_workspace_post_uidx on public.x_account_activity(workspace_id, x_post_id);
create unique index if not exists x_post_analytics_workspace_snapshot_uidx on public.x_post_analytics(workspace_id, x_post_id, snapshot_key);
create unique index if not exists x_post_performance_workspace_post_uidx on public.x_post_performance_memory(workspace_id, x_post_id) where x_post_id is not null;

do $$
declare
  table_name text;
  scoped_tables text[] := array[
    'x_sources', 'x_topic_candidates', 'x_drafts', 'x_publications', 'x_agent_runs', 'x_settings',
    'x_reply_inbox', 'x_reply_drafts', 'x_post_analytics', 'x_radar_items', 'x_social_evidence',
    'x_editorial_objects', 'x_editorial_adaptations', 'x_social_pattern_observations',
    'x_source_controls', 'x_telegram_control_events', 'x_editor_feedback', 'x_editor_profiles',
    'x_draft_learning_metadata', 'x_post_performance_memory', 'x_learning_reports',
    'x_growth_strategy_snapshots', 'x_growth_decisions', 'x_growth_daily_briefs', 'x_growth_reports',
    'x_growth_intelligence_memory', 'x_account_health_snapshots', 'x_competitor_observations',
    'x_growth_gaps', 'x_growth_series', 'x_growth_calendar_entries', 'x_growth_experiments',
    'x_growth_executive_reports', 'x_account_activity', 'x_autonomy_decisions',
    'x_autonomy_schedules', 'x_metric_checkpoints', 'x_learning_versions', 'x_autonomy_audit_events'
  ];
begin
  foreach table_name in array scoped_tables loop
    execute format('create index if not exists %I on public.%I(workspace_id)', table_name || '_workspace_idx', table_name);
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || table_name)::regclass
        and conname = table_name || '_workspace_id_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (workspace_id) references public.workspaces(id) on delete restrict',
        table_name, table_name || '_workspace_id_fkey'
      );
    end if;
  end loop;
end $$;

-- Phase 2 strategy tables will consume this ownership boundary without changing
-- the content pipeline contract: workspace_content_strategies,
-- workspace_content_pillars, workspace_topic_preferences,
-- workspace_topic_exclusions, and workspace_source_preferences. No strategy
-- engine or client UI is created in Phase 1.
create index if not exists x_candidates_workspace_topic_idx on public.x_topic_candidates(workspace_id, topic_cluster, created_at desc);
create index if not exists x_drafts_workspace_topic_idx on public.x_drafts(workspace_id, topic_cluster, created_at desc);
create index if not exists x_growth_gaps_workspace_topic_idx on public.x_growth_gaps(workspace_id, topic, created_at desc);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and accepted_at is not null
  );
$$;

create or replace function public.is_workspace_manager(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and accepted_at is not null
      and role in ('owner', 'admin')
  );
$$;

alter table public.organizations enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.x_accounts enable row level security;
alter table public.workspace_operator_grants enable row level security;

drop policy if exists organization_member_select on public.organizations;
create policy organization_member_select on public.organizations for select using (
  exists (select 1 from public.workspaces w where w.organization_id = organizations.id and public.is_workspace_member(w.id))
);

drop policy if exists workspace_member_select on public.workspaces;
create policy workspace_member_select on public.workspaces for select using (public.is_workspace_member(id));

drop policy if exists workspace_members_self_or_manager on public.workspace_members;
create policy workspace_members_self_or_manager on public.workspace_members for all using (
  user_id = auth.uid() or public.is_workspace_manager(workspace_id)
) with check (
  user_id = auth.uid() or public.is_workspace_manager(workspace_id)
);

drop policy if exists x_account_member_all on public.x_accounts;
create policy x_account_member_all on public.x_accounts for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

do $$
declare
  table_name text;
  scoped_tables text[] := array[
    'x_sources', 'x_topic_candidates', 'x_drafts', 'x_publications', 'x_agent_runs', 'x_settings',
    'x_reply_inbox', 'x_reply_drafts', 'x_post_analytics', 'x_radar_items', 'x_social_evidence',
    'x_editorial_objects', 'x_editorial_adaptations', 'x_social_pattern_observations',
    'x_source_controls', 'x_telegram_control_events', 'x_editor_feedback', 'x_editor_profiles',
    'x_draft_learning_metadata', 'x_post_performance_memory', 'x_learning_reports',
    'x_growth_strategy_snapshots', 'x_growth_decisions', 'x_growth_daily_briefs', 'x_growth_reports',
    'x_growth_intelligence_memory', 'x_account_health_snapshots', 'x_competitor_observations',
    'x_growth_gaps', 'x_growth_series', 'x_growth_calendar_entries', 'x_growth_experiments',
    'x_growth_executive_reports', 'x_account_activity', 'x_autonomy_decisions',
    'x_autonomy_schedules', 'x_metric_checkpoints', 'x_learning_versions', 'x_autonomy_audit_events'
  ];
begin
  foreach table_name in array scoped_tables loop
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', table_name);
    execute format('drop policy if exists workspace_member_all on public.%I', table_name);
    execute format(
      'create policy workspace_member_all on public.%I for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))',
      table_name
    );
  end loop;
end $$;

grant select on public.organizations, public.workspaces, public.workspace_members, public.x_accounts to authenticated;
grant select, insert, update, delete on public.organizations, public.workspaces, public.workspace_members, public.x_accounts to service_role;
grant select, insert, update, delete on public.workspace_operator_grants to service_role;

commit;
