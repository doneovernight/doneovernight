create extension if not exists pgcrypto;

create table if not exists public.website_os_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  domain text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_os_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  email text not null,
  password_hash text not null,
  role text not null default 'Viewer' check (role in ('Owner', 'Admin', 'Editor', 'Viewer')),
  active boolean not null default true,
  last_login timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.website_os_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  user_id uuid not null references public.website_os_users(id) on delete cascade,
  session_token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);

create index if not exists website_os_workspaces_slug_idx
  on public.website_os_workspaces (slug);

create index if not exists website_os_users_workspace_email_idx
  on public.website_os_users (workspace_id, email);

create index if not exists website_os_sessions_token_idx
  on public.website_os_sessions (session_token);

create index if not exists website_os_sessions_workspace_user_idx
  on public.website_os_sessions (workspace_id, user_id);

create index if not exists website_os_sessions_expires_idx
  on public.website_os_sessions (expires_at);

alter table public.website_os_workspaces enable row level security;
alter table public.website_os_users enable row level security;
alter table public.website_os_sessions enable row level security;

insert into public.website_os_workspaces (slug, display_name, domain, status)
values ('cp', 'COMMONPL4CE', 'doneovernight.com/cp', 'active')
on conflict (slug) do update set
  display_name = excluded.display_name,
  domain = excluded.domain,
  status = excluded.status,
  updated_at = now();
