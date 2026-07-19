-- Account activity is the source of truth for authenticated @doneovernight
-- timeline posts. Analytics and performance memory may therefore belong to a
-- manual post as well as an agent publication.

begin;

alter table public.x_account_activity
  add column if not exists source_kind text not null default 'authenticated_timeline';

update public.x_account_activity
set publication_origin = case publication_origin
  when 'agent' then 'agent_original'
  when 'manual' then 'manual_original'
  else publication_origin
end;

alter table public.x_account_activity
  drop constraint if exists x_account_activity_publication_origin_check;
alter table public.x_account_activity
  add constraint x_account_activity_publication_origin_check
  check (publication_origin in ('agent_original', 'manual_original', 'reply', 'repost'));

alter table public.x_post_analytics
  alter column publication_id drop not null,
  add column if not exists account_activity_x_post_id text,
  add column if not exists snapshot_key text;

update public.x_post_analytics
set snapshot_key = coalesce(snapshot_key, 'legacy:' || id::text)
where snapshot_key is null;

alter table public.x_post_analytics
  alter column snapshot_key set not null;

update public.x_post_analytics analytics
set account_activity_x_post_id = activity.x_post_id
from public.x_account_activity activity
where analytics.x_post_id = activity.x_post_id
  and analytics.account_activity_x_post_id is null;

create unique index if not exists x_post_analytics_post_snapshot_key_idx
  on public.x_post_analytics(x_post_id, snapshot_key);
create index if not exists x_post_analytics_activity_recorded_at_idx
  on public.x_post_analytics(account_activity_x_post_id, recorded_at desc);

alter table public.x_post_performance_memory
  alter column publication_id drop not null,
  add column if not exists x_post_id text,
  add column if not exists account_activity_x_post_id text;

update public.x_post_performance_memory memory
set x_post_id = publication.x_post_id,
    account_activity_x_post_id = publication.x_post_id
from public.x_publications publication
where memory.publication_id = publication.id
  and memory.x_post_id is null;

alter table public.x_post_performance_memory
  drop constraint if exists x_post_performance_memory_publication_id_key;

create unique index if not exists x_post_performance_memory_x_post_id_idx
  on public.x_post_performance_memory(x_post_id)
  where x_post_id is not null;
create index if not exists x_post_performance_memory_activity_idx
  on public.x_post_performance_memory(account_activity_x_post_id, recorded_at desc);

alter table public.x_account_activity enable row level security;
alter table public.x_post_analytics enable row level security;
alter table public.x_post_performance_memory enable row level security;

grant select, insert, update, delete on table
  public.x_account_activity,
  public.x_post_analytics,
  public.x_post_performance_memory
to service_role;

commit;
