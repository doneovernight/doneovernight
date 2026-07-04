-- Creator OS Phase 1.1: Creator OS media and block columns
-- The Vercel API also stores settings in analytics_events until this dedicated table is applied.

alter table if exists public.creators
  add column if not exists hero_video_url text not null default '',
  add column if not exists music_enabled boolean not null default false,
  add column if not exists music_url text not null default '',
  add column if not exists music_volume numeric not null default 0.35,
  add column if not exists music_loop boolean not null default false,
  add column if not exists intro_audio_enabled boolean not null default false,
  add column if not exists intro_audio_url text not null default '',
  add column if not exists intro_audio_volume numeric not null default 0.35,
  add column if not exists intro_audio_fade_out_duration numeric not null default 2,
  add column if not exists intro_audio_stop_after numeric not null default 4,
  add column if not exists welcome_intro_enabled boolean not null default false,
  add column if not exists background_gradient text not null default '',
  add column if not exists redirect_mina_enabled boolean not null default false,
  add column if not exists discord_link_visible boolean not null default false,
  add column if not exists discord_link_title text not null default '',
  add column if not exists discord_link_subtitle text not null default '',
  add column if not exists discord_link_cta_label text not null default '',
  add column if not exists tiktok_link_visible boolean not null default false,
  add column if not exists tiktok_link_title text not null default '',
  add column if not exists tiktok_link_subtitle text not null default '',
  add column if not exists tiktok_link_cta_label text not null default '',
  add column if not exists battle_link_visible boolean not null default false,
  add column if not exists battle_link_title text not null default '',
  add column if not exists battle_link_subtitle text not null default '',
  add column if not exists battle_link_cta_label text not null default '',
  add column if not exists business_link_visible boolean not null default false,
  add column if not exists business_link_title text not null default '',
  add column if not exists business_link_subtitle text not null default '',
  add column if not exists business_link_cta_label text not null default '',
  add column if not exists music_link_visible boolean not null default false,
  add column if not exists music_link_title text not null default '',
  add column if not exists music_link_subtitle text not null default '',
  add column if not exists music_link_cta_label text not null default '',
  add column if not exists newsletter_cta_label text not null default '',
  add column if not exists community_link_visible boolean not null default false,
  add column if not exists community_link_title text not null default '',
  add column if not exists community_link_subtitle text not null default '',
  add column if not exists community_link_cta_label text not null default '';

insert into public.creators (
  id,
  username,
  slug
) values (
  '11111111-1111-4111-8111-111111111111',
  'mosyaamosya',
  'mosyaamosya'
) on conflict do nothing;
