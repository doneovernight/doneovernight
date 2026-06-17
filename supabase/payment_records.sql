create sequence if not exists public.invoice_number_seq start 1;

create or replace function public.next_invoice_number()
returns text
language sql
as $$
  select 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');
$$;

create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default public.next_invoice_number(),
  task_id text not null,
  client_email text not null,
  client_name text,
  workspace_id text,
  invoice_amount text not null,
  currency text not null default 'EUR',
  payment_reference text not null,
  provider_reference text,
  invoice_pdf_url text,
  invoice_download_token_hash text not null,
  status text not null default 'paid',
  invoice_snapshot jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists payment_records_payment_reference_idx
  on public.payment_records (payment_reference);

create index if not exists payment_records_task_id_idx
  on public.payment_records (task_id);

create index if not exists payment_records_client_email_idx
  on public.payment_records (client_email);

create index if not exists payment_records_created_at_idx
  on public.payment_records (created_at desc);
