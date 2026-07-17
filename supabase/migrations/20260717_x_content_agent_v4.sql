-- DONEOVERNIGHT X Content Agent V4. Additive editor-learning memory.
-- RLS stays enabled; only the server-side service_role can access these tables.

create table if not exists public.x_editor_feedback (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.x_drafts(id) on delete set null,
  action text not null check (action in ('approve', 'reject', 'regenerate', 'publish', 'delete')),
  reasons jsonb not null default '[]'::jsonb,
  editor_comments text,
  scores jsonb not null default '{}'::jsonb,
  source_url text,
  topic text,
  format text,
  operator text not null default 'doneovernight_admin',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.x_editor_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique default 'doneovernight',
  version integer not null default 1,
  preferences jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.x_draft_learning_metadata (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.x_drafts(id) on delete cascade,
  predicted_approval numeric(4,3) not null check (predicted_approval between 0 and 1),
  predicted_rejections jsonb not null default '[]'::jsonb,
  why_this_exists text,
  similar_drafts jsonb not null default '[]'::jsonb,
  learned_from jsonb not null default '[]'::jsonb,
  profile_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.x_post_performance_memory (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null unique references public.x_publications(id) on delete cascade,
  draft_id uuid references public.x_drafts(id) on delete set null,
  views bigint,
  likes bigint,
  replies bigint,
  quotes bigint,
  reposts bigint,
  bookmarks bigint,
  followers_gained bigint,
  profile_visits bigint,
  account_followers bigint,
  first_engagement_minutes numeric(10,2),
  velocity numeric(12,6),
  normalized_performance numeric(12,6),
  final_score numeric(12,6),
  metrics jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.x_learning_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  sample_size integer not null default 0,
  approval_rate numeric(6,4),
  average_weighted_length numeric(8,2),
  average_performance numeric(12,6),
  report jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  weight_changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists x_editor_feedback_draft_created_idx on public.x_editor_feedback(draft_id, created_at desc);
create index if not exists x_editor_feedback_action_created_idx on public.x_editor_feedback(action, created_at desc);
create index if not exists x_draft_learning_metadata_prediction_idx on public.x_draft_learning_metadata(predicted_approval desc);
create index if not exists x_post_performance_memory_score_idx on public.x_post_performance_memory(final_score desc nulls last);

alter table public.x_editor_feedback enable row level security;
alter table public.x_editor_profiles enable row level security;
alter table public.x_draft_learning_metadata enable row level security;
alter table public.x_post_performance_memory enable row level security;
alter table public.x_learning_reports enable row level security;

grant select, insert, update, delete on table
  public.x_editor_feedback,
  public.x_editor_profiles,
  public.x_draft_learning_metadata,
  public.x_post_performance_memory,
  public.x_learning_reports
to service_role;
