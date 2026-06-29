create table if not exists public.journey_confirmations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  social_handle text,
  journey_id text,
  chosen_path text,
  chosen_interests text[] default '{}',
  result text,
  source text default 'how_it_works',
  selected_language text,
  browser_language text,
  detected_content_language text,
  email_language text,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'opened', 'clicked')),
  provider text,
  message_id text,
  error text,
  raw_payload jsonb default '{}'::jsonb
);

alter table public.journey_confirmations add column if not exists selected_language text;
alter table public.journey_confirmations add column if not exists browser_language text;
alter table public.journey_confirmations add column if not exists detected_content_language text;
alter table public.journey_confirmations add column if not exists email_language text;

create index if not exists journey_confirmations_email_idx
  on public.journey_confirmations (email);

create index if not exists journey_confirmations_journey_id_idx
  on public.journey_confirmations (journey_id);

create index if not exists journey_confirmations_status_idx
  on public.journey_confirmations (status);

create index if not exists journey_confirmations_created_at_idx
  on public.journey_confirmations (created_at desc);
