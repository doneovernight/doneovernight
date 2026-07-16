-- DONEOVERNIGHT X Content Agent V2. Additive, idempotent production migration.
-- Keeps RLS enabled and grants only the server-side Supabase service_role.

alter table public.x_drafts
  add column if not exists insight_score numeric(4,3) check (insight_score between 0 and 1),
  add column if not exists save_score numeric(4,3) check (save_score between 0 and 1),
  add column if not exists repost_score numeric(4,3) check (repost_score between 0 and 1),
  add column if not exists educational_value numeric(4,3) check (educational_value between 0 and 1),
  add column if not exists brand_alignment numeric(4,3) check (brand_alignment between 0 and 1),
  add column if not exists source_label text,
  add column if not exists mention_preview text;

alter table public.x_drafts drop constraint if exists x_drafts_post_type_check;
alter table public.x_drafts add constraint x_drafts_post_type_check check (post_type in (
  'news_interpretation', 'practical_insight', 'build_note',
  'builder_insight', 'observation', 'framework', 'opinion', 'lesson'
));

alter table public.x_agent_runs drop constraint if exists x_agent_runs_run_type_check;
alter table public.x_agent_runs add constraint x_agent_runs_run_type_check check (run_type in ('discovery', 'publishing', 'engagement', 'analytics'));

create table if not exists public.x_reply_inbox (
  id uuid primary key default gen_random_uuid(),
  x_event_id text not null unique,
  interaction_type text not null check (interaction_type in ('reply', 'mention', 'quote')),
  publication_id uuid references public.x_publications(id) on delete set null,
  source_draft_id uuid references public.x_drafts(id) on delete set null,
  author_id text,
  author_username text,
  text text not null,
  classification text not null check (classification in ('question', 'feedback', 'bug', 'praise', 'potential_client', 'potential_operator', 'spam')),
  related_post_text text,
  created_at_x timestamptz,
  received_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'drafted', 'rejected')),
  raw_metrics jsonb not null default '{}'::jsonb
);

create table if not exists public.x_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null unique references public.x_reply_inbox(id) on delete cascade,
  source_draft_id uuid references public.x_drafts(id) on delete set null,
  text text not null,
  weighted_character_count integer not null check (weighted_character_count between 0 and 280),
  classification text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  status text not null default 'queued' check (status in ('queued', 'approved', 'rejected', 'sent')),
  model_output jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.x_post_analytics (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.x_publications(id) on delete cascade,
  x_post_id text not null,
  recorded_at timestamptz not null default now(),
  views bigint,
  likes bigint,
  replies bigint,
  quotes bigint,
  reposts bigint,
  bookmarks bigint,
  profile_visits bigint,
  follower_count bigint,
  followers_gained_after_post bigint,
  raw_metrics jsonb not null default '{}'::jsonb
);

create index if not exists x_reply_inbox_status_received_at_idx on public.x_reply_inbox(status, received_at desc);
create index if not exists x_reply_drafts_source_draft_created_at_idx on public.x_reply_drafts(source_draft_id, created_at desc);
create index if not exists x_post_analytics_publication_recorded_at_idx on public.x_post_analytics(publication_id, recorded_at desc);

alter table public.x_reply_inbox enable row level security;
alter table public.x_reply_drafts enable row level security;
alter table public.x_post_analytics enable row level security;

grant select, insert, update, delete on table public.x_reply_inbox, public.x_reply_drafts, public.x_post_analytics to service_role;
