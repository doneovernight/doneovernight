-- Creator OS: real poll votes and newsletter response inbox.

alter table public.creators
  add column if not exists poll_enabled boolean not null default false,
  add column if not exists poll_question text not null default '',
  add column if not exists poll_options jsonb not null default '["Yes","No"]'::jsonb;

create table if not exists public.creator_poll_votes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  creator_slug text not null,
  poll_key text not null,
  option_id text not null,
  option_label text not null,
  voter_hash text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists creator_poll_votes_creator_poll_idx
  on public.creator_poll_votes (creator_id, poll_key, created_at desc);

create unique index if not exists creator_poll_votes_soft_dedupe_idx
  on public.creator_poll_votes (creator_id, poll_key, voter_hash);

create table if not exists public.creator_newsletter_signups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  creator_slug text not null,
  email text not null,
  email_hash text not null,
  source_page text not null default '',
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists creator_newsletter_signups_creator_idx
  on public.creator_newsletter_signups (creator_id, created_at desc);

create unique index if not exists creator_newsletter_signups_soft_dedupe_idx
  on public.creator_newsletter_signups (creator_id, email_hash);

alter table public.creator_poll_votes enable row level security;
alter table public.creator_newsletter_signups enable row level security;
