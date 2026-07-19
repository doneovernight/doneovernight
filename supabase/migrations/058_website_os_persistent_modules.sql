-- Website OS persistent module foundation. Schema only: no client content or fixtures.

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

create table if not exists public.website_os_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  name text not null,
  email text,
  instagram text,
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'archived', 'trashed')),
  is_test boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists website_os_clients_workspace_email_idx
  on public.website_os_clients (workspace_id, lower(email))
  where email is not null and deleted_at is null;
create index if not exists website_os_clients_workspace_status_idx
  on public.website_os_clients (workspace_id, status, updated_at desc);

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
  on public.website_os_message_threads (workspace_id, booking_task_id) where booking_task_id is not null;

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

create table if not exists public.website_os_media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  filename text not null,
  storage_bucket text,
  storage_path text,
  public_url text,
  mime_type text not null,
  byte_size bigint not null default 0 check (byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  alt_text text not null default '',
  category text not null default 'other',
  status text not null default 'draft' check (status in ('draft', 'ready', 'hidden', 'archived', 'trashed')),
  is_test boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_os_media_assets_storage_location check (
    (storage_bucket is null and storage_path is null and public_url is null) or
    (storage_bucket is not null and storage_path is not null and public_url is not null)
  )
);

create unique index if not exists website_os_media_assets_workspace_storage_idx
  on public.website_os_media_assets (workspace_id, storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;
create index if not exists website_os_media_assets_workspace_status_idx
  on public.website_os_media_assets (workspace_id, status, updated_at desc);

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

create table if not exists public.website_os_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  actor_user_id uuid references public.website_os_users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  previous_state jsonb not null default '{}'::jsonb,
  next_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_os_audit_events_workspace_entity_idx
  on public.website_os_audit_events (workspace_id, entity_type, entity_id, created_at desc);

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

do $$
declare
  target text;
begin
  foreach target in array array[
    'website_os_clients', 'website_os_message_threads', 'website_os_messages',
    'website_os_email_templates', 'website_os_email_sends', 'website_os_media_assets',
    'website_os_portfolio_projects'
  ] loop
    execute format('drop trigger if exists %I on public.%I', target || '_touch_updated_at', target);
    execute format('create trigger %I before update on public.%I for each row execute function public.website_os_touch_updated_at()', target || '_touch_updated_at', target);
  end loop;
end;
$$;

alter table public.website_os_clients enable row level security;
alter table public.website_os_message_threads enable row level security;
alter table public.website_os_messages enable row level security;
alter table public.website_os_email_templates enable row level security;
alter table public.website_os_email_sends enable row level security;
alter table public.website_os_media_assets enable row level security;
alter table public.website_os_portfolio_projects enable row level security;
alter table public.website_os_portfolio_media enable row level security;
alter table public.website_os_audit_events enable row level security;
alter table public.website_os_acceptance_fixtures enable row level security;

grant select, insert, update, delete on public.website_os_clients to service_role;
grant select, insert, update, delete on public.website_os_message_threads to service_role;
grant select, insert, update, delete on public.website_os_messages to service_role;
grant select, insert, update, delete on public.website_os_email_templates to service_role;
grant select, insert, update, delete on public.website_os_email_sends to service_role;
grant select, insert, update, delete on public.website_os_media_assets to service_role;
grant select, insert, update, delete on public.website_os_portfolio_projects to service_role;
grant select, insert, update, delete on public.website_os_portfolio_media to service_role;
grant select, insert, update, delete on public.website_os_audit_events to service_role;
grant select, insert, update, delete on public.website_os_acceptance_fixtures to service_role;
