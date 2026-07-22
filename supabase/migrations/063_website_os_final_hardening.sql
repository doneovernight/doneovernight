-- Reconcile the production Website OS schema and enforce least privilege.
-- This migration is intentionally idempotent because migrations 057-060 were
-- applied outside the current Supabase migration ledger.

begin;

create extension if not exists pgcrypto;

create or replace function public.website_os_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.website_os_message_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  client_id uuid references public.website_os_clients(id) on delete set null,
  booking_task_id text,
  subject text not null default '',
  status text not null default 'open' check (status in ('open', 'archived', 'trashed')),
  is_read boolean not null default false,
  is_test boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_os_message_threads_workspace_status_idx
  on public.website_os_message_threads (workspace_id, status, updated_at desc);
create index if not exists website_os_message_threads_booking_idx
  on public.website_os_message_threads (workspace_id, booking_task_id)
  where booking_task_id is not null;

create table if not exists public.website_os_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  thread_id uuid not null references public.website_os_message_threads(id) on delete cascade,
  author_user_id uuid references public.website_os_users(id) on delete set null,
  direction text not null check (direction in ('incoming', 'outgoing', 'internal')),
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'queued', 'sent', 'failed', 'archived', 'trashed')),
  read_at timestamptz,
  sent_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_os_messages_thread_idx
  on public.website_os_messages (workspace_id, thread_id, created_at asc);

create table if not exists public.website_os_email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  template_key text not null,
  name text not null,
  subject_template text not null,
  body_template text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived', 'trashed')),
  is_test boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, template_key)
);

create table if not exists public.website_os_email_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  template_id uuid references public.website_os_email_templates(id) on delete set null,
  client_id uuid references public.website_os_clients(id) on delete set null,
  booking_task_id text,
  recipient_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'test', 'queued', 'sent', 'failed', 'trashed')),
  provider_message_id text,
  provider_error text,
  is_test boolean not null default false,
  sent_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_os_email_sends_workspace_status_idx
  on public.website_os_email_sends (workspace_id, status, created_at desc);

create table if not exists public.website_os_portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  title text not null,
  slug text not null,
  category text not null default '',
  description text not null default '',
  seo_title text not null default '',
  seo_description text not null default '',
  cover_media_id uuid references public.website_os_media_assets(id) on delete set null,
  display_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'ready', 'published', 'archived', 'trashed')),
  is_test boolean not null default false,
  published_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists website_os_portfolio_projects_workspace_status_idx
  on public.website_os_portfolio_projects (workspace_id, status, display_order, updated_at desc);

create table if not exists public.website_os_portfolio_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  project_id uuid not null references public.website_os_portfolio_projects(id) on delete cascade,
  media_asset_id uuid not null references public.website_os_media_assets(id) on delete restrict,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, media_asset_id)
);

create index if not exists website_os_portfolio_media_project_order_idx
  on public.website_os_portfolio_media (workspace_id, project_id, display_order);

create table if not exists public.website_os_acceptance_fixtures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  fixture_key text not null,
  resource_type text not null,
  resource_id text,
  cleanup_payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.website_os_users(id) on delete set null,
  expires_at timestamptz,
  cleaned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, fixture_key)
);

create index if not exists website_os_acceptance_fixtures_workspace_cleanup_idx
  on public.website_os_acceptance_fixtures (workspace_id, cleaned_at, expires_at);

create table if not exists public.website_os_auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  workspace_slug text not null,
  email_hash text not null,
  ip_hash text not null,
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_slug, email_hash, ip_hash)
);

create index if not exists website_os_auth_rate_limits_lock_idx
  on public.website_os_auth_rate_limits (locked_until)
  where locked_until is not null;

create table if not exists public.website_os_auth_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.website_os_workspaces(id) on delete set null,
  user_id uuid references public.website_os_users(id) on delete set null,
  event_type text not null check (event_type in (
    'login_succeeded', 'login_failed', 'login_rate_limited', 'logout',
    'password_changed', 'sessions_revoked', 'session_expired'
  )),
  success boolean not null,
  email_hash text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_os_auth_events_workspace_created_idx
  on public.website_os_auth_events (workspace_id, created_at desc);
create index if not exists website_os_auth_events_user_created_idx
  on public.website_os_auth_events (user_id, created_at desc)
  where user_id is not null;

alter table public.website_os_auth_events
  drop constraint if exists website_os_auth_events_event_type_check;
alter table public.website_os_auth_events
  add constraint website_os_auth_events_event_type_check check (event_type in (
    'login_succeeded', 'login_failed', 'login_rate_limited', 'logout',
    'password_changed', 'sessions_revoked', 'session_revoked', 'session_expired'
  ));

create table if not exists public.website_os_public_rate_limits (
  scope text not null,
  fingerprint text not null,
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default now(),
  last_request_at timestamptz not null default now(),
  primary key (scope, fingerprint)
);

create index if not exists website_os_public_rate_limits_last_request_idx
  on public.website_os_public_rate_limits (last_request_at);

create or replace function public.website_os_register_public_ingest(
  p_scope text,
  p_fingerprint text,
  p_window_seconds integer,
  p_max_requests integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.website_os_public_rate_limits%rowtype;
  now_value timestamptz := now();
  next_count integer;
begin
  if coalesce(p_scope, '') = '' or coalesce(p_fingerprint, '') = '' or p_window_seconds < 1 or p_max_requests < 1 then
    raise exception 'PUBLIC_RATE_IDENTIFIER_INVALID' using errcode = '22023';
  end if;

  select * into current_row from public.website_os_public_rate_limits
    where scope = p_scope and fingerprint = p_fingerprint for update;

  if current_row.scope is null then
    insert into public.website_os_public_rate_limits (scope, fingerprint, request_count, window_started_at, last_request_at)
      values (p_scope, p_fingerprint, 1, now_value, now_value)
      returning * into current_row;
  else
    next_count := case when current_row.window_started_at < now_value - make_interval(secs => p_window_seconds)
      then 1 else current_row.request_count + 1 end;
    update public.website_os_public_rate_limits set
      request_count = next_count,
      window_started_at = case when current_row.window_started_at < now_value - make_interval(secs => p_window_seconds) then now_value else current_row.window_started_at end,
      last_request_at = now_value
      where scope = p_scope and fingerprint = p_fingerprint
      returning * into current_row;
  end if;

  return jsonb_build_object(
    'allowed', current_row.request_count <= p_max_requests,
    'request_count', current_row.request_count,
    'retry_after_seconds', greatest(1, extract(epoch from current_row.window_started_at + make_interval(secs => p_window_seconds) - now_value)::integer)
  );
end;
$$;

alter table public.task_requests
  add column if not exists website_os_workspace_id uuid references public.website_os_workspaces(id) on delete set null;

create or replace function public.website_os_commonpl4ce_analytics_summary(p_since timestamptz)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with workspace as (
    select id from public.website_os_workspaces where slug = 'cp' and status = 'active' limit 1
  ),
  events as (
    select event_type, route, metadata
    from public.analytics_events
    where source = 'commonpl4ce' and created_at >= p_since
  ),
  test_bookings as (
    select task_id
    from public.task_requests
    where website_os_workspace_id = (select id from workspace)
      and source = 'commonpl4ce_booker'
      and created_at >= p_since
      and lower(coalesce(raw_payload ->> 'website_os_test_record', 'false')) = 'true'
  ),
  event_totals as (
    select
      count(*) filter (where event_type = 'page_view' and route = '/cp') as cp_visits,
      count(*) filter (where event_type = 'page_view' and route = '/cp-book') as cp_book_visits,
      count(*) filter (where event_type = 'book_cta_click') as book_cta_clicks,
      count(*) filter (where event_type = 'booker_station_view') as booker_station_views,
      count(*) filter (where event_type = 'form_start' and route = '/cp-book') as form_starts,
      count(*) filter (
        where event_type = 'form_submit_success' and route = '/cp-book'
          and not exists (select 1 from test_bookings test where test.task_id = events.metadata ->> 'booking_id')
      ) as form_success,
      count(*) filter (where event_type = 'newsletter_start') as newsletter_starts,
      count(*) filter (where event_type = 'scroll_depth' and metadata ->> 'depth' = '25') as scroll_25,
      count(*) filter (where event_type = 'scroll_depth' and metadata ->> 'depth' = '50') as scroll_50,
      count(*) filter (where event_type = 'scroll_depth' and metadata ->> 'depth' = '75') as scroll_75,
      count(*) filter (where event_type = 'scroll_depth' and metadata ->> 'depth' = '100') as scroll_100
    from events
  ),
  newsletters as (
    select email, created_at, coalesce(raw_payload ->> 'path', '') as path
    from public.task_requests
    where website_os_workspace_id = (select id from workspace)
      and source = 'commonpl4ce_newsletter'
      and created_at >= p_since
    order by created_at desc
  ),
  recent_newsletters as (
    select coalesce(jsonb_agg(jsonb_build_object('email', email, 'createdAt', created_at, 'path', path) order by created_at desc), '[]'::jsonb) as rows
    from (select * from newsletters limit 8) recent
  )
  select jsonb_build_object(
    'connected', true,
    'generatedAt', now(),
    'metrics', jsonb_build_object(
      'cpVisits', totals.cp_visits,
      'cpBookVisits', totals.cp_book_visits,
      'bookCtaClicks', totals.book_cta_clicks,
      'bookerStationViews', totals.booker_station_views,
      'bookingFormStarts', totals.form_starts,
      'bookingFormSubmissions', totals.form_success,
      'conversionRate', case when totals.form_starts > 0 and totals.form_success <= totals.form_starts then round((totals.form_success::numeric / totals.form_starts) * 100)::integer else null end,
      'conversionDenominator', 'Tracked /cp-book form starts',
      'conversionMessage', case when totals.form_starts = 0 then 'No tracked form starts yet.' when totals.form_success > totals.form_starts then 'Historical form-start coverage is incomplete.' else '' end,
      'newsletterStarts', totals.newsletter_starts,
      'newsletterSignups', (select count(*) from newsletters),
      'testBookingsExcluded', (select count(*) from test_bookings)
    ),
    'scrollDropoff', jsonb_build_object('25', totals.scroll_25, '50', totals.scroll_50, '75', totals.scroll_75, '100', totals.scroll_100),
    'recentSignups', (select rows from recent_newsletters)
  )
  from event_totals totals;
$$;

create or replace function public.website_os_register_auth_attempt(
  p_workspace_slug text,
  p_email_hash text,
  p_ip_hash text,
  p_succeeded boolean,
  p_window_seconds integer default 900,
  p_max_failures integer default 6,
  p_lock_seconds integer default 900
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.website_os_auth_rate_limits%rowtype;
  now_value timestamptz := now();
  next_failures integer;
begin
  if coalesce(p_workspace_slug, '') = '' or coalesce(p_email_hash, '') = '' or coalesce(p_ip_hash, '') = '' then
    raise exception 'AUTH_RATE_IDENTIFIER_INVALID' using errcode = '22023';
  end if;

  if p_succeeded then
    delete from public.website_os_auth_rate_limits
      where workspace_slug = p_workspace_slug and email_hash = p_email_hash and ip_hash = p_ip_hash;
    return jsonb_build_object('locked', false, 'failure_count', 0, 'locked_until', null);
  end if;

  select * into current_row
    from public.website_os_auth_rate_limits
    where workspace_slug = p_workspace_slug and email_hash = p_email_hash and ip_hash = p_ip_hash
    for update;

  if current_row.id is null then
    next_failures := 1;
    insert into public.website_os_auth_rate_limits (
      workspace_slug, email_hash, ip_hash, failure_count, window_started_at,
      locked_until, last_attempt_at, updated_at
    ) values (
      p_workspace_slug, p_email_hash, p_ip_hash, next_failures, now_value,
      null, now_value, now_value
    ) returning * into current_row;
  else
    next_failures := case
      when current_row.window_started_at < now_value - make_interval(secs => p_window_seconds) then 1
      else current_row.failure_count + 1
    end;
    update public.website_os_auth_rate_limits set
      failure_count = next_failures,
      window_started_at = case
        when current_row.window_started_at < now_value - make_interval(secs => p_window_seconds) then now_value
        else current_row.window_started_at
      end,
      locked_until = case
        when next_failures >= p_max_failures then now_value + make_interval(secs => p_lock_seconds)
        else null
      end,
      last_attempt_at = now_value,
      updated_at = now_value
      where id = current_row.id
      returning * into current_row;
  end if;

  return jsonb_build_object(
    'locked', current_row.locked_until is not null and current_row.locked_until > now_value,
    'failure_count', current_row.failure_count,
    'locked_until', current_row.locked_until
  );
end;
$$;

alter table public.website_os_sessions
  add column if not exists user_agent text,
  add column if not exists ip_hash text;

create index if not exists website_os_sessions_user_activity_idx
  on public.website_os_sessions (workspace_id, user_id, last_activity desc);

update public.task_requests task
set website_os_workspace_id = workspace.id
from public.website_os_workspaces workspace
where workspace.slug = 'cp'
  and task.website_os_workspace_id is null
  and lower(coalesce(task.source, '')) in (
    'commonpl4ce_booker', 'commonpl4ce_booker_v1',
    'commonpl4ce_newsletter', 'commonpl4ce_site_config'
  );

create index if not exists task_requests_website_os_workspace_idx
  on public.task_requests (website_os_workspace_id, source, created_at desc)
  where website_os_workspace_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'task_requests_commonpl4ce_workspace_required'
      and conrelid = 'public.task_requests'::regclass
  ) then
    alter table public.task_requests add constraint task_requests_commonpl4ce_workspace_required
      check (
        lower(coalesce(source, '')) not in (
          'commonpl4ce_booker', 'commonpl4ce_booker_v1',
          'commonpl4ce_newsletter', 'commonpl4ce_site_config'
        ) or website_os_workspace_id is not null
      ) not valid;
  end if;
end;
$$;

alter table public.task_requests validate constraint task_requests_commonpl4ce_workspace_required;

do $$
declare
  target text;
begin
  foreach target in array array[
    'website_os_message_threads', 'website_os_messages',
    'website_os_email_templates', 'website_os_email_sends',
    'website_os_portfolio_projects'
  ] loop
    execute format('drop trigger if exists %I on public.%I', target || '_touch_updated_at', target);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.website_os_touch_updated_at()',
      target || '_touch_updated_at', target
    );
  end loop;
end;
$$;

alter table public.website_os_message_threads enable row level security;
alter table public.website_os_messages enable row level security;
alter table public.website_os_email_templates enable row level security;
alter table public.website_os_email_sends enable row level security;
alter table public.website_os_portfolio_projects enable row level security;
alter table public.website_os_portfolio_media enable row level security;
alter table public.website_os_acceptance_fixtures enable row level security;
alter table public.website_os_auth_rate_limits enable row level security;
alter table public.website_os_auth_events enable row level security;
alter table public.website_os_public_rate_limits enable row level security;

drop policy if exists "Allow public update task requests" on public.task_requests;
revoke insert, update, delete, truncate on table public.task_requests from anon, authenticated;

do $$
declare
  target text;
begin
  foreach target in array array[
    'website_os_workspaces', 'website_os_users', 'website_os_sessions',
    'website_os_clients', 'website_os_client_bookings', 'website_os_invoices',
    'website_os_message_threads', 'website_os_messages',
    'website_os_email_templates', 'website_os_email_sends',
    'website_os_media_assets', 'website_os_portfolio_projects',
    'website_os_portfolio_media', 'website_os_audit_events',
    'website_os_acceptance_fixtures', 'website_os_content_drafts',
    'website_os_content_versions', 'website_os_content_state',
    'website_os_auth_rate_limits', 'website_os_auth_events',
    'website_os_public_rate_limits'
  ] loop
    if to_regclass('public.' || target) is not null then
      execute format('revoke all privileges on table public.%I from anon, authenticated', target);
      execute format('grant select, insert, update, delete on table public.%I to service_role', target);
    end if;
  end loop;
end;
$$;

revoke all on function public.website_os_register_auth_attempt(text, text, text, boolean, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.website_os_register_auth_attempt(text, text, text, boolean, integer, integer, integer)
  to service_role;

revoke all on function public.website_os_register_public_ingest(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.website_os_register_public_ingest(text, text, integer, integer)
  to service_role;

revoke all on function public.website_os_commonpl4ce_analytics_summary(timestamptz)
  from public, anon, authenticated;
grant execute on function public.website_os_commonpl4ce_analytics_summary(timestamptz)
  to service_role;

commit;
