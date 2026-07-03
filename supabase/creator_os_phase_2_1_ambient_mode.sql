-- Creator OS Phase 2.1: location-aware ambient mode

alter table if exists public.creators
  add column if not exists ambient_mode_enabled boolean not null default true,
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists seasonal_effects_enabled boolean not null default true,
  add column if not exists holiday_effects_enabled boolean not null default true;

update public.creators
set
  ambient_mode_enabled = true,
  timezone = 'America/Chicago',
  seasonal_effects_enabled = true,
  holiday_effects_enabled = true,
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111'
   or slug = 'mosyaamosya';
