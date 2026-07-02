-- Creator OS Phase 1: Mina creator hub
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
  live_button_text text not null default 'Join Live',
  theme_preset text not null default 'onyx',
  subscribe_popup_enabled boolean not null default true,
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
  display_name,
  username,
  slug,
  bio,
  location,
  avatar_url,
  banner_url,
  tiktok_url,
  discord_url,
  instagram_url,
  tiktok_coins_url,
  business_email,
  live_url,
  live_status,
  live_button_text,
  theme_preset,
  subscribe_popup_enabled,
  subscribe_popup_title,
  subscribe_popup_copy
) values (
  '11111111-1111-4111-8111-111111111111',
  'Mina',
  'mina',
  'mina',
  'A premium creator hub for drops, live moments, community links, and the next thing Mina is building.',
  'Amsterdam, NL',
  '',
  '',
  'https://www.tiktok.com/@mina',
  '',
  'https://www.instagram.com/mina',
  'https://www.tiktok.com/coin',
  'mina@doneovernight.com',
  '',
  false,
  'Join Live',
  'onyx',
  true,
  'Get Mina''s next drop',
  'Join the private update list for live alerts, community drops, and behind-the-scenes releases.'
) on conflict (id) do update set
  display_name = excluded.display_name,
  username = excluded.username,
  slug = excluded.slug,
  bio = excluded.bio,
  location = excluded.location,
  avatar_url = excluded.avatar_url,
  banner_url = excluded.banner_url,
  tiktok_url = excluded.tiktok_url,
  discord_url = excluded.discord_url,
  instagram_url = excluded.instagram_url,
  tiktok_coins_url = excluded.tiktok_coins_url,
  business_email = excluded.business_email,
  live_url = excluded.live_url,
  live_status = excluded.live_status,
  live_button_text = excluded.live_button_text,
  theme_preset = excluded.theme_preset,
  subscribe_popup_enabled = excluded.subscribe_popup_enabled,
  subscribe_popup_title = excluded.subscribe_popup_title,
  subscribe_popup_copy = excluded.subscribe_popup_copy,
  updated_at = now();
