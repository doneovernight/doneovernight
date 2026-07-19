-- DONEOVERNIGHT account-activity sync. Read-only X timeline data is persisted
-- separately from agent publications so manual and external posts remain visible.

create table if not exists public.x_account_activity (
  x_post_id text primary key,
  account_id text not null,
  text text not null,
  created_at timestamptz not null,
  publication_origin text not null check (publication_origin in ('agent', 'manual', 'reply', 'repost')),
  is_reply boolean not null default false,
  is_repost boolean not null default false,
  is_currently_visible boolean not null default true,
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists x_account_activity_visible_created_idx on public.x_account_activity (is_currently_visible, created_at desc);
create index if not exists x_account_activity_origin_created_idx on public.x_account_activity (publication_origin, created_at desc);

alter table public.x_account_activity enable row level security;
grant select, insert, update, delete on table public.x_account_activity to service_role;
