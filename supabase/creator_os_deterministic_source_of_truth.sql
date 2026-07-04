-- Creator OS deterministic source of truth
-- Apply before release so Creator settings/runtime actions use one persistent row.

create extension if not exists pgcrypto;

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default '',
  username text not null default '',
  slug text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creators
  add column if not exists bio text not null default '',
  add column if not exists location text not null default '',
  add column if not exists avatar_url text not null default '',
  add column if not exists banner_url text not null default '',
  add column if not exists hero_video_url text not null default '',
  add column if not exists tiktok_url text not null default '',
  add column if not exists discord_url text not null default '',
  add column if not exists instagram_url text not null default '',
  add column if not exists tiktok_coins_url text not null default '',
  add column if not exists business_email text not null default '',
  add column if not exists live_url text not null default '',
  add column if not exists live_status boolean not null default false,
  add column if not exists live_button_text text not null default 'Join Live',
  add column if not exists tiktok_live_username text not null default 'mosyaamosya',
  add column if not exists auto_live_detection_enabled boolean not null default true,
  add column if not exists manual_live_fallback_enabled boolean not null default true,
  add column if not exists battle_mode_enabled boolean not null default false,
  add column if not exists battle_opponent text not null default '',
  add column if not exists battle_result text not null default '',
  add column if not exists battle_win_streak integer not null default 0,
  add column if not exists battle_updated_at timestamptz,
  add column if not exists battle_undo_snapshot text not null default '',
  add column if not exists next_live_datetime timestamptz,
  add column if not exists pinned_block text not null default '',
  add column if not exists community_state text not null default 'open',
  add column if not exists quick_announcement text not null default '',
  add column if not exists quick_poll text not null default '',
  add column if not exists poll_enabled boolean not null default false,
  add column if not exists poll_question text not null default '',
  add column if not exists poll_options jsonb not null default '["Yes","No"]'::jsonb,
  add column if not exists faq_visible boolean not null default true,
  add column if not exists discord_visible boolean not null default true,
  add column if not exists creator_passport_visible boolean not null default true,
  add column if not exists theme_preset text not null default 'mina',
  add column if not exists creator_dna text not null default 'streamer',
  add column if not exists subscribe_popup_enabled boolean not null default true,
  add column if not exists subscribe_popup_title text not null default '',
  add column if not exists subscribe_popup_copy text not null default '',
  add column if not exists music_enabled boolean not null default false,
  add column if not exists music_url text not null default '',
  add column if not exists music_volume numeric not null default 0.35,
  add column if not exists music_loop boolean not null default true,
  add column if not exists intro_audio_enabled boolean not null default false,
  add column if not exists intro_audio_url text not null default '',
  add column if not exists intro_audio_volume numeric not null default 0.35,
  add column if not exists intro_audio_fade_out_duration numeric not null default 2,
  add column if not exists intro_audio_stop_after numeric not null default 4,
  add column if not exists welcome_intro_enabled boolean not null default true,
  add column if not exists background_gradient text not null default '',
  add column if not exists ambient_mode_enabled boolean not null default true,
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists seasonal_effects_enabled boolean not null default true,
  add column if not exists holiday_effects_enabled boolean not null default true,
  add column if not exists redirect_mina_enabled boolean not null default true,
  add column if not exists discord_invite_url text not null default '',
  add column if not exists discord_server_id text not null default '',
  add column if not exists discord_link_visible boolean not null default true,
  add column if not exists discord_link_title text not null default 'Discord',
  add column if not exists discord_link_subtitle text not null default 'Community',
  add column if not exists discord_link_cta_label text not null default 'Join',
  add column if not exists tiktok_link_visible boolean not null default true,
  add column if not exists tiktok_link_title text not null default 'TikTok',
  add column if not exists tiktok_link_subtitle text not null default '@mosyaamosya',
  add column if not exists tiktok_link_cta_label text not null default 'Watch',
  add column if not exists battle_link_visible boolean not null default true,
  add column if not exists battle_link_title text not null default 'Prepare for Battle',
  add column if not exists battle_link_subtitle text not null default 'Get your TikTok Coins before the battle begins.',
  add column if not exists battle_link_cta_label text not null default 'Prepare',
  add column if not exists business_link_visible boolean not null default true,
  add column if not exists business_link_title text not null default 'Business',
  add column if not exists business_link_subtitle text not null default 'Booking and collabs',
  add column if not exists business_link_cta_label text not null default 'Email',
  add column if not exists music_link_visible boolean not null default false,
  add column if not exists music_link_title text not null default 'Music',
  add column if not exists music_link_subtitle text not null default 'Mina''s stream soundtrack',
  add column if not exists music_link_cta_label text not null default 'Open',
  add column if not exists newsletter_cta_label text not null default 'Subscribe to the Mailing List',
  add column if not exists newsletter_destination text not null default '',
  add column if not exists faq_link_visible boolean not null default false,
  add column if not exists faq_link_title text not null default 'Frequently Asked on Stream',
  add column if not exists faq_link_subtitle text not null default 'Quick answers from Mina''s livestreams.',
  add column if not exists faq_link_cta_label text not null default 'Read',
  add column if not exists faq_link_url text not null default '',
  add column if not exists faq_items jsonb not null default '[]'::jsonb,
  add column if not exists community_link_visible boolean not null default true,
  add column if not exists community_link_title text not null default 'Community',
  add column if not exists community_link_subtitle text not null default 'Join Mina''s Discord for stream updates and community drops.',
  add column if not exists community_link_cta_label text not null default 'Join Discord',
  add column if not exists community_link_url text not null default '',
  add column if not exists share_link_visible boolean not null default true,
  add column if not exists custom_links jsonb not null default '[]'::jsonb,
  add column if not exists public_page_order jsonb not null default '[]'::jsonb;

create unique index if not exists creators_slug_key on public.creators (slug);
create unique index if not exists creators_username_key on public.creators (username);
create index if not exists creators_updated_at_idx on public.creators (updated_at desc);

alter table public.creators enable row level security;
grant select on public.creators to anon, authenticated;
grant all on public.creators to service_role;

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

insert into public.creators (
  id,
  display_name,
  username,
  slug,
  bio,
  location,
  avatar_url,
  hero_video_url,
  tiktok_url,
  discord_url,
  tiktok_coins_url,
  business_email,
  live_url,
  live_status,
  tiktok_live_username,
  updated_at
) values (
  '11111111-1111-4111-8111-111111111111',
  'Mina Mosya',
  'mosyaamosya',
  'mosyaamosya',
  'Daily livestreams, community, yapping, and soft chaos from Chicago.',
  'Chicago 🇺🇸',
  '/assets/mosyaamosya/profile-v2.jpg',
  '/assets/mosyaamosya/intro.mp4',
  'https://www.tiktok.com/@mosyaamosya',
  'https://discord.gg/GGE7WsUZR',
  'https://www.tiktok.com/coin',
  'mina@doneovernight.com',
  'https://www.tiktok.com/@mosyaamosya/live',
  false,
  'mosyaamosya',
  now()
) on conflict (id) do update set
  slug = excluded.slug,
  username = excluded.username,
  updated_at = greatest(public.creators.updated_at, excluded.updated_at);
