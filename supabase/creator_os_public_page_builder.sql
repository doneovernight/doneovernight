alter table if exists public.creators
  add column if not exists public_page_order jsonb not null default '[]'::jsonb;

update public.creators
set public_page_order = coalesce(public_page_order, '[]'::jsonb)
where public_page_order is null;
