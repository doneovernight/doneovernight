-- Creator OS: live metadata and manual battle fallback

alter table if exists public.creators
  add column if not exists battle_mode_enabled boolean not null default false,
  add column if not exists battle_opponent text not null default '',
  add column if not exists battle_result text not null default '',
  add column if not exists battle_win_streak integer not null default 0,
  add column if not exists battle_updated_at timestamptz,
  add column if not exists battle_undo_snapshot text not null default '';
