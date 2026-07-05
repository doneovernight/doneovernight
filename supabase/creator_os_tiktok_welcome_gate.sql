-- Creator OS: TikTok-only welcome gate and hero image fields.
-- Schema only. Creator-editable content stays owned by Creator Admin/saveCreator().

alter table if exists public.creators
  add column if not exists hero_image_url text,
  add column if not exists tiktok_welcome_enabled boolean,
  add column if not exists tiktok_welcome_title text,
  add column if not exists tiktok_welcome_message text,
  add column if not exists tiktok_welcome_primary_label text,
  add column if not exists tiktok_welcome_secondary_label text,
  add column if not exists tiktok_welcome_gate_enabled boolean,
  add column if not exists tiktok_welcome_gate_title text,
  add column if not exists tiktok_welcome_gate_message text,
  add column if not exists tiktok_welcome_gate_primary_label text,
  add column if not exists tiktok_welcome_gate_secondary_label text,
  add column if not exists tiktok_welcome_gate_copy_label text;
