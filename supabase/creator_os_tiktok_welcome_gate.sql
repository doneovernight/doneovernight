-- Creator OS: TikTok-only welcome gate fields.
-- Schema only. Creator-editable content stays owned by Creator Admin/saveCreator().

alter table if exists public.creators
  add column if not exists tiktok_welcome_enabled boolean,
  add column if not exists tiktok_welcome_title text,
  add column if not exists tiktok_welcome_message text,
  add column if not exists tiktok_welcome_primary_label text,
  add column if not exists tiktok_welcome_secondary_label text;
