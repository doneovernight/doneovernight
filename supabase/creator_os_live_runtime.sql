-- Creator OS: TikTok live runtime controls

alter table if exists public.creators
  add column if not exists tiktok_live_username text not null default 'mosyaamosya',
  add column if not exists auto_live_detection_enabled boolean not null default true,
  add column if not exists manual_live_fallback_enabled boolean not null default true;

update public.creators
set
  tiktok_live_username = coalesce(nullif(tiktok_live_username, ''), 'mosyaamosya'),
  auto_live_detection_enabled = coalesce(auto_live_detection_enabled, true),
  manual_live_fallback_enabled = coalesce(manual_live_fallback_enabled, true),
  live_url = coalesce(nullif(live_url, ''), 'https://www.tiktok.com/@mosyaamosya/live'),
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111'
   or slug = 'mosyaamosya';
