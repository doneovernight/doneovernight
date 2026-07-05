-- Creator OS: optional message for the next stream countdown.
-- Schema only. Creator-editable content stays owned by Creator Admin/saveCreator().

alter table if exists public.creators
  add column if not exists countdown_message text;
