create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  last_source text,
  page_hostname text,
  segment text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  dispatch_subscribed boolean not null default false,
  dispatch_subscribed_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_contacts_email_idx on public.crm_contacts (email);
create index if not exists crm_contacts_dispatch_subscribed_idx on public.crm_contacts (dispatch_subscribed);
