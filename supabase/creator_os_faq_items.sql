alter table if exists public.creators
  add column if not exists faq_items jsonb not null default '[]'::jsonb;
