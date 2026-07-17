-- DONEOVERNIGHT Social Intelligence Engine. Additive, explicit, and service-role only.
-- Radar findings are editorial evidence; no table in this migration can publish content.

create table if not exists public.x_radar_items (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  source_name text not null,
  source_kind text not null check (source_kind in ('official_rss', 'official_api', 'community_discussion', 'manual_evidence')),
  title text not null,
  summary text,
  entities jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  discovered_at timestamptz not null default now(),
  scores jsonb not null default '{}'::jsonb,
  recommendation text not null check (recommendation in ('ignore', 'watch', 'monitor', 'generate', 'immediate_priority')),
  sharing_reasons jsonb not null default '[]'::jsonb,
  recommended_format text,
  audience jsonb not null default '[]'::jsonb,
  lifespan text not null default 'short' check (lifespan in ('short', 'medium', 'long')),
  screenshot_available boolean not null default false,
  attribution text not null,
  status text not null default 'active' check (status in ('active', 'ignored', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.x_social_evidence (
  id uuid primary key default gen_random_uuid(),
  radar_item_id uuid references public.x_radar_items(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('screenshot', 'official_post', 'official_article', 'discussion')),
  source_url text not null,
  attribution text not null,
  ocr_summary text,
  extracted_entities jsonb not null default '[]'::jsonb,
  discussion_signals jsonb not null default '{}'::jsonb,
  rights_status text not null default 'attribution_required' check (rights_status in ('attribution_required', 'cleared', 'blocked')),
  created_at timestamptz not null default now()
);

create table if not exists public.x_editorial_objects (
  id uuid primary key default gen_random_uuid(),
  radar_item_id uuid references public.x_radar_items(id) on delete set null,
  canonical_brief jsonb not null default '{}'::jsonb,
  commentary_angle text not null,
  source_attribution text not null,
  status text not null default 'review' check (status in ('review', 'rejected', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.x_editorial_adaptations (
  id uuid primary key default gen_random_uuid(),
  editorial_object_id uuid not null references public.x_editorial_objects(id) on delete cascade,
  platform text not null check (platform in ('x', 'threads', 'linkedin', 'bluesky', 'instagram', 'newsletter', 'website')),
  adaptation jsonb not null default '{}'::jsonb,
  status text not null default 'review' check (status in ('review', 'rejected', 'archived')),
  created_at timestamptz not null default now(),
  unique(editorial_object_id, platform)
);

create table if not exists public.x_social_pattern_observations (
  id uuid primary key default gen_random_uuid(),
  pattern_key text not null,
  source text not null default 'doneovernight',
  evidence jsonb not null default '{}'::jsonb,
  sample_size integer not null default 0,
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create index if not exists x_radar_items_recommendation_idx on public.x_radar_items(recommendation, discovered_at desc);
create index if not exists x_radar_items_entities_idx on public.x_radar_items using gin(entities);
create index if not exists x_social_evidence_radar_idx on public.x_social_evidence(radar_item_id, created_at desc);
create index if not exists x_editorial_objects_radar_idx on public.x_editorial_objects(radar_item_id, created_at desc);
create index if not exists x_social_patterns_key_idx on public.x_social_pattern_observations(pattern_key, created_at desc);

alter table public.x_radar_items enable row level security;
alter table public.x_social_evidence enable row level security;
alter table public.x_editorial_objects enable row level security;
alter table public.x_editorial_adaptations enable row level security;
alter table public.x_social_pattern_observations enable row level security;

grant select, insert, update, delete on table
  public.x_radar_items,
  public.x_social_evidence,
  public.x_editorial_objects,
  public.x_editorial_adaptations,
  public.x_social_pattern_observations
to service_role;

alter table public.x_agent_runs drop constraint if exists x_agent_runs_run_type_check;
alter table public.x_agent_runs add constraint x_agent_runs_run_type_check check (run_type in (
  'discovery', 'publishing', 'engagement', 'analytics',
  'autonomy', 'autonomy_publish', 'autonomy_metrics', 'radar'
));
