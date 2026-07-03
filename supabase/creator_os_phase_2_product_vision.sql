-- Creator OS Phase 2: Theme Engine and Creator DNA

alter table if exists public.creators
  add column if not exists creator_dna text not null default 'streamer';

update public.creators
set
  creator_dna = coalesce(nullif(creator_dna, ''), 'streamer'),
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111'
   or slug = 'mosyaamosya';
