-- Creator OS: selected Support sticker from the shared Sticker Library.
-- Schema only. Creator-editable content stays owned by Creator Admin/saveCreator().

alter table if exists public.creators
  add column if not exists support_sticker_key text default 'coffee';
