-- Creator OS Phase 2.1: location-aware ambient mode

alter table if exists public.creators
  add column if not exists ambient_mode_enabled boolean not null default false,
  add column if not exists timezone text not null default '',
  add column if not exists seasonal_effects_enabled boolean not null default false,
  add column if not exists holiday_effects_enabled boolean not null default false;
