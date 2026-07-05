-- Creator OS: optional Community card sticker.
-- Schema only. Creator-editable content stays owned by Creator Admin/saveCreator().

alter table if exists public.creators
  add column if not exists community_sticker_enabled boolean default true;
