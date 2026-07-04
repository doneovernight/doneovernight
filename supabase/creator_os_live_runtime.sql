-- Creator OS: TikTok live runtime controls

alter table if exists public.creators
  add column if not exists tiktok_live_username text not null default '',
  add column if not exists auto_live_detection_enabled boolean not null default true,
  add column if not exists manual_live_fallback_enabled boolean not null default false;
