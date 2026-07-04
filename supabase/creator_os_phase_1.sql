-- Creator OS Phase 1: creator hub schema
-- Apply in Supabase before using the admin save flow.

create extension if not exists citext;

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default '',
  username citext not null unique,
  slug citext not null unique,
  bio text not null default '',
  location text not null default '',
  avatar_url text not null default '',
  banner_url text not null default '',
  tiktok_url text not null default '',
  discord_url text not null default '',
  instagram_url text not null default '',
  tiktok_coins_url text not null default '',
  business_email text not null default '',
  live_url text not null default '',
  live_status boolean not null default false,
  live_button_text text not null default '',
  theme_preset text not null default '',
  subscribe_popup_enabled boolean not null default false,
  subscribe_popup_title text not null default '',
  subscribe_popup_copy text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creators enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'creators'
      and policyname = 'creators_public_read'
  ) then
    create policy "creators_public_read"
      on public.creators
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.creators to anon, authenticated;
grant all on public.creators to service_role;

insert into public.creators (
  id,
  username,
  slug
) values (
  '11111111-1111-4111-8111-111111111111',
  'mosyaamosya',
  'mosyaamosya'
) on conflict do nothing;
