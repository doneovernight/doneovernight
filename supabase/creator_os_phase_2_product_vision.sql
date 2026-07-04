-- Creator OS Phase 2: Theme Engine and Creator DNA

alter table if exists public.creators
  add column if not exists creator_dna text not null default '';
