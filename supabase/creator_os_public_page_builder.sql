alter table if exists public.creators
  add column if not exists public_page_order jsonb not null default '[]'::jsonb;
