-- Persistent, workspace-scoped invoicing for Website OS.

create extension if not exists pgcrypto;

create sequence if not exists public.website_os_invoice_number_seq start with 1;

create or replace function public.website_os_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.website_os_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  actor_user_id uuid references public.website_os_users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  previous_state jsonb not null default '{}'::jsonb,
  next_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_os_audit_events_workspace_entity_idx
  on public.website_os_audit_events (workspace_id, entity_type, entity_id, created_at desc);

create table if not exists public.website_os_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  booking_task_id text not null,
  invoice_number text unique,
  customer_name text not null,
  customer_email text not null,
  customer_company text not null default '',
  customer_details jsonb not null default '{}'::jsonb,
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  currency text not null default 'EUR' check (currency = 'EUR'),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  vat_rate numeric(5,2) not null default 21 check (vat_rate >= 0 and vat_rate <= 100),
  vat_cents bigint not null check (vat_cents >= 0),
  total_cents bigint not null check (total_cents >= 0 and total_cents = subtotal_cents + vat_cents),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'cancelled', 'refunded')),
  issue_date date not null,
  due_date date not null check (due_date >= issue_date),
  sent_at timestamptz,
  paid_at timestamptz,
  overdue_at timestamptz,
  cancelled_at timestamptz,
  allow_duplicate boolean not null default false,
  duplicate_approved_by uuid references public.website_os_users(id) on delete set null,
  duplicate_approved_at timestamptz,
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_os_invoice_payment_state check (
    (status = 'paid' and payment_status = 'paid' and paid_at is not null) or
    (status = 'cancelled' and payment_status = 'cancelled' and cancelled_at is not null) or
    (status not in ('paid', 'cancelled') and payment_status in ('unpaid', 'refunded'))
  ),
  constraint website_os_invoice_duplicate_approval check (
    (allow_duplicate = false and duplicate_approved_by is null and duplicate_approved_at is null) or
    (allow_duplicate = true and duplicate_approved_by is not null and duplicate_approved_at is not null)
  )
);

create unique index if not exists website_os_invoices_booking_active_unique_idx
  on public.website_os_invoices (workspace_id, booking_task_id)
  where status <> 'cancelled' and allow_duplicate = false;
create index if not exists website_os_invoices_workspace_status_idx
  on public.website_os_invoices (workspace_id, status, issue_date desc);
create index if not exists website_os_invoices_workspace_booking_idx
  on public.website_os_invoices (workspace_id, booking_task_id, created_at desc);
create index if not exists website_os_invoices_workspace_paid_idx
  on public.website_os_invoices (workspace_id, paid_at desc)
  where status = 'paid';

create or replace function public.website_os_assign_invoice_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  workspace_prefix text;
begin
  if new.invoice_number is null or btrim(new.invoice_number) = '' then
    select upper(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g'))
      into workspace_prefix
      from public.website_os_workspaces
      where id = new.workspace_id;
    workspace_prefix := coalesce(nullif(workspace_prefix, ''), 'WS');
    new.invoice_number := workspace_prefix || '-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.website_os_invoice_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists website_os_invoices_assign_number on public.website_os_invoices;
create trigger website_os_invoices_assign_number
  before insert on public.website_os_invoices
  for each row execute function public.website_os_assign_invoice_number();

drop trigger if exists website_os_invoices_touch_updated_at on public.website_os_invoices;
create trigger website_os_invoices_touch_updated_at
  before update on public.website_os_invoices
  for each row execute function public.website_os_touch_updated_at();

alter table public.website_os_invoices enable row level security;
alter table public.website_os_audit_events enable row level security;

grant usage, select on sequence public.website_os_invoice_number_seq to service_role;
grant select, insert, update, delete on public.website_os_invoices to service_role;
grant select, insert, update, delete on public.website_os_audit_events to service_role;
