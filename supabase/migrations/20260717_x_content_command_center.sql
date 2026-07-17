-- DONEOVERNIGHT X Command Center. Additive source-control state only.
-- Source URLs remain code-owned; browser users can only control known persisted sources.

create table if not exists public.x_source_controls (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.x_sources(id) on delete cascade,
  enabled boolean not null default true,
  trust_level numeric(4,3) not null default 0.900 check (trust_level between 0.600 and 1.000),
  topic_scope text,
  updated_at timestamptz not null default now()
);

create index if not exists x_source_controls_enabled_idx on public.x_source_controls(enabled);
alter table public.x_source_controls enable row level security;
grant select, insert, update, delete on table public.x_source_controls to service_role;
