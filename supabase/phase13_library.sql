-- DONEOVERNIGHT Phase 13 - Builder Library metadata
-- Safe additive migration. Do not drop or rename production data.

alter table if exists public.resource_interest
  add column if not exists product text,
  add column if not exists category text,
  add column if not exists access text,
  add column if not exists builder_number text,
  add column if not exists raw_payload jsonb;

create index if not exists resource_interest_product_idx
  on public.resource_interest (product);

create index if not exists resource_interest_builder_number_idx
  on public.resource_interest (builder_number);

notify pgrst, 'reload schema';
