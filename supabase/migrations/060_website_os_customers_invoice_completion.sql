-- Complete persistent customers and invoicing for Website OS.

create extension if not exists pgcrypto;

create table if not exists public.website_os_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  name text not null,
  company text not null default '',
  email text,
  normalized_email text not null default '',
  normalized_company text not null default '',
  phone text not null default '',
  billing_address text not null default '',
  vat_number text not null default '',
  instagram text not null default '',
  notes text not null default '',
  booking_context jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived', 'trashed')),
  is_test boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_os_clients_identity_required check (
    btrim(name) <> '' and (normalized_email <> '' or normalized_company <> '')
  )
);

alter table public.website_os_clients add column if not exists company text not null default '';
alter table public.website_os_clients add column if not exists normalized_email text not null default '';
alter table public.website_os_clients add column if not exists normalized_company text not null default '';
alter table public.website_os_clients add column if not exists phone text not null default '';
alter table public.website_os_clients add column if not exists billing_address text not null default '';
alter table public.website_os_clients add column if not exists vat_number text not null default '';
alter table public.website_os_clients add column if not exists booking_context jsonb not null default '{}'::jsonb;
alter table public.website_os_clients add column if not exists updated_by uuid references public.website_os_users(id) on delete set null;

update public.website_os_clients
set normalized_email = lower(btrim(coalesce(email, ''))),
    normalized_company = lower(regexp_replace(btrim(coalesce(company, '')), '[^a-zA-Z0-9]+', '', 'g'))
where normalized_email = '' or normalized_company = '';

drop index if exists public.website_os_clients_workspace_email_idx;
create unique index if not exists website_os_clients_workspace_normalized_email_idx
  on public.website_os_clients (workspace_id, normalized_email)
  where normalized_email <> '' and deleted_at is null;
create unique index if not exists website_os_clients_workspace_normalized_company_idx
  on public.website_os_clients (workspace_id, normalized_company)
  where normalized_company <> '' and deleted_at is null;
create index if not exists website_os_clients_workspace_status_idx
  on public.website_os_clients (workspace_id, status, updated_at desc);

create table if not exists public.website_os_client_bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  client_id uuid not null references public.website_os_clients(id) on delete cascade,
  booking_task_id text not null,
  booking_snapshot jsonb not null default '{}'::jsonb,
  linked_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, booking_task_id)
);

create index if not exists website_os_client_bookings_client_idx
  on public.website_os_client_bookings (workspace_id, client_id, created_at desc);

alter table public.website_os_invoices alter column booking_task_id drop not null;
alter table public.website_os_invoices add column if not exists client_id uuid references public.website_os_clients(id) on delete restrict;
alter table public.website_os_invoices add column if not exists notes text not null default '';
alter table public.website_os_invoices add column if not exists send_history jsonb not null default '[]'::jsonb;
alter table public.website_os_invoices add column if not exists payment_history jsonb not null default '[]'::jsonb;
alter table public.website_os_invoices add column if not exists credited_at timestamptz;

alter table public.website_os_invoices drop constraint if exists website_os_invoices_invoice_number_key;
create unique index if not exists website_os_invoices_workspace_number_idx
  on public.website_os_invoices (workspace_id, invoice_number);

alter table public.website_os_invoices drop constraint if exists website_os_invoices_status_check;
alter table public.website_os_invoices add constraint website_os_invoices_status_check
  check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'credited'));
alter table public.website_os_invoices drop constraint if exists website_os_invoices_payment_status_check;
alter table public.website_os_invoices add constraint website_os_invoices_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'cancelled', 'refunded', 'credited'));
alter table public.website_os_invoices drop constraint if exists website_os_invoice_payment_state;
alter table public.website_os_invoices add constraint website_os_invoice_payment_state check (
  (status = 'paid' and payment_status = 'paid' and paid_at is not null) or
  (status = 'cancelled' and payment_status = 'cancelled' and cancelled_at is not null) or
  (status = 'credited' and payment_status in ('credited', 'refunded') and credited_at is not null) or
  (status not in ('paid', 'cancelled', 'credited') and payment_status = 'unpaid')
);
alter table public.website_os_invoices drop constraint if exists website_os_invoice_origin_required;
alter table public.website_os_invoices add constraint website_os_invoice_origin_required
  check (booking_task_id is not null or client_id is not null);

create index if not exists website_os_invoices_workspace_client_idx
  on public.website_os_invoices (workspace_id, client_id, created_at desc)
  where client_id is not null;

drop trigger if exists website_os_clients_touch_updated_at on public.website_os_clients;
create trigger website_os_clients_touch_updated_at
  before update on public.website_os_clients
  for each row execute function public.website_os_touch_updated_at();

alter table public.website_os_clients enable row level security;
alter table public.website_os_client_bookings enable row level security;
grant select, insert, update, delete on public.website_os_clients to service_role;
grant select, insert, update, delete on public.website_os_client_bookings to service_role;
