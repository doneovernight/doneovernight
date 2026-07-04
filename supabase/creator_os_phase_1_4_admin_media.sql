-- Creator OS Phase 1.4: creator-safe admin ownership and media fields

alter table if exists public.creators
  add column if not exists next_live_datetime timestamptz,
  add column if not exists discord_invite_url text not null default '',
  add column if not exists discord_server_id text not null default '';

create table if not exists public.creator_auth (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_auth enable row level security;
revoke all on public.creator_auth from anon, authenticated;
grant all on public.creator_auth to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-media',
  'creator-media',
  true,
  10000000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp3',
    'audio/mpeg3',
    'audio/x-mpeg',
    'audio/x-mpeg-3',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/aac',
    'audio/aacp',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
