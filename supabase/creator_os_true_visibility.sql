alter table public.creators
  add column if not exists share_link_visible boolean not null default true;

update public.creators
set share_link_visible = coalesce(share_link_visible, true)
where slug in ('mosyaamosya', 'mina');
