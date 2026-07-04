alter table public.creators
  add column if not exists share_link_visible boolean not null default false;
