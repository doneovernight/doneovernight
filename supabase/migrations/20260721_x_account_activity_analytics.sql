-- Account activity has three distinct facts:
--   classification: what the timeline item is;
--   publication_origin: who published it when that can be determined;
--   ingestion_source: how this record entered the account-activity store.
-- This migration is safe after the previous failed attempt: it normalizes rows
-- before recreating constraints and leaves all historical records intact.

begin;

alter table public.x_account_activity
  add column if not exists classification text;

alter table public.x_account_activity
  add column if not exists ingestion_source text;

alter table public.x_account_activity
  add column if not exists source_kind text;

-- Preserve any partial-migration provenance column before retiring it. The old
-- column was introduced by this migration family and is not post ownership.
update public.x_account_activity
set ingestion_source = coalesce(
  ingestion_source,
  case source_kind
    when 'agent_publication' then 'agent_publish'
    when 'agent_publish' then 'agent_publish'
    when 'backfill' then 'backfill'
    when 'reconciliation' then 'reconciliation'
    else 'authenticated_timeline'
  end
)
where ingestion_source is null;

-- Establish agent ownership before deriving classification so a legacy row that
-- matches an agent publication cannot be misclassified as manual.
update public.x_account_activity
set publication_origin = 'agent'
from public.x_publications publication
where publication.x_post_id = x_account_activity.x_post_id;

-- Classify first. This accepts the partially written failing row where
-- classification is already agent_original and publication_origin was used
-- incorrectly for authenticated_timeline provenance.
update public.x_account_activity
set classification = case
  when classification in ('agent_original', 'manual_original', 'reply', 'repost') then classification
  when is_repost then 'repost'
  when is_reply then 'reply'
  when publication_origin = 'repost' then 'repost'
  when publication_origin = 'reply' then 'reply'
  when publication_origin in ('agent', 'agent_original') then 'agent_original'
  else 'manual_original'
end
where classification is null
   or classification not in ('agent_original', 'manual_original', 'reply', 'repost');

-- The legacy constraint described classification values in publication_origin.
-- Remove it before normalizing ownership to agent/manual/unknown; otherwise an
-- existing reply or repost would make the normalization update fail.
alter table public.x_account_activity
  drop constraint if exists x_account_activity_publication_origin_check;

alter table public.x_account_activity
  drop constraint if exists x_account_activity_classification_check;

alter table public.x_account_activity
  drop constraint if exists x_account_activity_ingestion_source_check;

-- A matching agent publication determines ownership. Unmatched timeline
-- originals are manual; replies/reposts remain unknown unless they match one.
update public.x_account_activity
set publication_origin = 'agent'
from public.x_publications publication
where publication.x_post_id = x_account_activity.x_post_id;

update public.x_account_activity
set publication_origin = 'manual'
where classification in ('agent_original', 'manual_original')
  and publication_origin <> 'agent';

update public.x_account_activity
set publication_origin = 'unknown'
where classification in ('reply', 'repost')
  and publication_origin <> 'agent';

update public.x_account_activity
set ingestion_source = case
  when ingestion_source in ('authenticated_timeline', 'agent_publish', 'backfill', 'reconciliation') then ingestion_source
  else 'authenticated_timeline'
end;

alter table public.x_account_activity
  alter column classification set not null;

alter table public.x_account_activity
  alter column classification set default 'manual_original';

alter table public.x_account_activity
  alter column publication_origin set not null;

alter table public.x_account_activity
  alter column publication_origin set default 'unknown';

alter table public.x_account_activity
  alter column ingestion_source set not null;

alter table public.x_account_activity
  alter column ingestion_source set default 'authenticated_timeline';

alter table public.x_account_activity
  add constraint x_account_activity_publication_origin_check
    check (publication_origin in ('agent', 'manual', 'unknown'));

alter table public.x_account_activity
  add constraint x_account_activity_classification_check
    check (classification in ('agent_original', 'manual_original', 'reply', 'repost'));

alter table public.x_account_activity
  add constraint x_account_activity_ingestion_source_check
    check (ingestion_source in ('authenticated_timeline', 'agent_publish', 'backfill', 'reconciliation'));

-- source_kind was a partial migration column. Its values have been preserved
-- in ingestion_source, so retaining it would invite future semantic drift.
alter table public.x_account_activity drop column if exists source_kind;

alter table public.x_post_analytics
  alter column publication_id drop not null;

alter table public.x_post_analytics
  add column if not exists account_activity_x_post_id text;

alter table public.x_post_analytics
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
  alter column publication_id drop not null;

alter table public.x_post_performance_memory
  add column if not exists x_post_id text;

alter table public.x_post_performance_memory
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
