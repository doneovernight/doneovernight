-- Creator OS: live metadata and manual battle fallback

alter table if exists public.creators
  add column if not exists battle_mode_enabled boolean not null default false,
  add column if not exists battle_opponent text not null default '';

update public.creators
set
  battle_mode_enabled = coalesce(battle_mode_enabled, false),
  battle_opponent = coalesce(battle_opponent, ''),
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111'
   or slug = 'mosyaamosya';
