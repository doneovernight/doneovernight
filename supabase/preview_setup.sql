-- Creator OS Preview/Staging setup.
-- Safe for a fresh Supabase project. Do not run this against production.
-- Seeds neutral Preview test fixtures:
--   slug: preview-creator
--   username: preview-creator
--   display_name: Preview Creator
-- Test-only creator password: previewpreview
-- Preview-only Mina fixture, used only when the Preview database has no Mina row:
--   slug: mosyaamosya
--   username: mosyaamosya
--   display_name: Mina Mosya
-- Test-only Mina password on missing auth rows: previewpreview
-- Preview-only creative founder test creator:
--   slug: lara
--   username: larajadev
--   display_name: Lara Jade
-- Test-only Lara password: laralara

create extension if not exists pgcrypto;

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default '',
  username text not null default '',
  slug text not null default '',
  bio text not null default '',
  location text not null default '',
  avatar_url text not null default '',
  banner_url text not null default '',
  hero_image_url text not null default '',
  hero_video_url text not null default '',
  music_enabled boolean not null default false,
  music_url text not null default '',
  music_volume numeric not null default 0.35,
  music_loop boolean not null default true,
  intro_audio_enabled boolean not null default false,
  intro_audio_url text not null default '',
  intro_audio_volume numeric not null default 0.35,
  intro_audio_fade_out_duration numeric not null default 2,
  intro_audio_stop_after numeric not null default 4,
  tiktok_welcome_enabled boolean not null default true,
  tiktok_welcome_title text not null default '',
  tiktok_welcome_message text not null default '',
  tiktok_welcome_primary_label text not null default '',
  tiktok_welcome_secondary_label text not null default '',
  tiktok_welcome_gate_enabled boolean not null default true,
  tiktok_welcome_gate_title text not null default '',
  tiktok_welcome_gate_message text not null default '',
  tiktok_welcome_gate_primary_label text not null default '',
  tiktok_welcome_gate_secondary_label text not null default '',
  tiktok_welcome_gate_copy_label text not null default '',
  welcome_intro_enabled boolean not null default true,
  background_gradient text not null default '',
  ambient_mode_enabled boolean not null default true,
  timezone text not null default 'UTC',
  seasonal_effects_enabled boolean not null default false,
  holiday_effects_enabled boolean not null default false,
  redirect_mina_enabled boolean not null default false,
  tiktok_url text not null default '',
  discord_url text not null default '',
  instagram_url text not null default '',
  tiktok_coins_url text not null default 'https://www.tiktok.com/coin',
  business_email text not null default '',
  live_url text not null default '',
  live_status boolean not null default false,
  live_button_text text not null default 'Join Live',
  theme_preset text not null default 'mina',
  subscribe_popup_enabled boolean not null default false,
  subscribe_popup_title text not null default '',
  subscribe_popup_copy text not null default '',
  next_live_datetime timestamptz,
  countdown_message text not null default '',
  discord_invite_url text not null default '',
  discord_server_id text not null default '',
  creator_dna text not null default 'streamer',
  tiktok_live_username text not null default '',
  auto_live_detection_enabled boolean not null default true,
  manual_live_fallback_enabled boolean not null default true,
  battle_mode_enabled boolean not null default false,
  battle_opponent text not null default '',
  battle_result text not null default '',
  battle_win_streak integer not null default 0,
  battle_updated_at timestamptz,
  battle_undo_snapshot text not null default '',
  capabilities jsonb not null default '{}'::jsonb,
  live_enabled boolean not null default true,
  battle_enabled boolean not null default true,
  countdown_enabled boolean not null default true,
  announcements_enabled boolean not null default true,
  events_enabled boolean not null default false,
  portfolio_enabled boolean not null default false,
  support_enabled boolean not null default true,
  community_enabled boolean not null default true,
  newsletter_enabled boolean not null default true,
  pinned_block text not null default '',
  community_state text not null default 'open',
  quick_announcement text not null default '',
  quick_poll text not null default '',
  faq_visible boolean not null default true,
  discord_visible boolean not null default true,
  creator_passport_visible boolean not null default true,
  poll_enabled boolean not null default false,
  poll_question text not null default '',
  poll_options jsonb not null default '["Yes","No"]'::jsonb,
  discord_link_visible boolean not null default false,
  discord_link_title text not null default 'Discord',
  discord_link_subtitle text not null default 'Community',
  discord_link_cta_label text not null default 'Join',
  tiktok_link_visible boolean not null default false,
  tiktok_link_title text not null default 'TikTok',
  tiktok_link_subtitle text not null default '',
  tiktok_link_cta_label text not null default 'Watch',
  battle_link_visible boolean not null default false,
  battle_link_title text not null default 'Prepare for Battle',
  battle_link_subtitle text not null default 'Get your TikTok Coins before the battle begins.',
  battle_link_cta_label text not null default 'Prepare',
  support_link_visible boolean not null default false,
  support_link_title text not null default 'Support Me',
  support_link_subtitle text not null default 'Every contribution helps me create more content.',
  support_link_cta_label text not null default 'Support',
  support_link_provider text not null default 'custom',
  support_link_url text not null default '',
  support_sticker_enabled boolean not null default true,
  support_sticker_animation_enabled boolean not null default true,
  business_link_visible boolean not null default false,
  business_link_title text not null default 'Business',
  business_link_subtitle text not null default 'Partnerships and collabs.',
  business_link_cta_label text not null default 'Contact',
  music_link_visible boolean not null default false,
  music_link_title text not null default 'Music',
  music_link_subtitle text not null default '',
  music_link_cta_label text not null default 'Open',
  newsletter_cta_label text not null default 'Subscribe to the Mailing List',
  newsletter_destination text not null default '',
  faq_link_visible boolean not null default false,
  faq_link_title text not null default 'Frequently Asked on Stream',
  faq_link_subtitle text not null default 'Quick answers from livestreams.',
  faq_link_cta_label text not null default 'Read',
  faq_link_url text not null default '',
  faq_items jsonb not null default '[]'::jsonb,
  community_link_visible boolean not null default false,
  community_link_title text not null default 'Community',
  community_link_subtitle text not null default 'Join the community.',
  community_link_cta_label text not null default 'Join',
  community_link_url text not null default '',
  community_sticker_enabled boolean not null default true,
  share_link_visible boolean not null default true,
  custom_links jsonb not null default '[]'::jsonb,
  public_page_order jsonb not null default '["community","discord","tiktok","prepare","support","business","music","faq","poll","newsletter","announcement","countdown","share"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists creators_slug_key on public.creators (slug);
create unique index if not exists creators_username_key on public.creators (username);
create index if not exists creators_updated_at_idx on public.creators (updated_at desc);

alter table public.creators
  add column if not exists capabilities jsonb not null default '{}'::jsonb,
  add column if not exists live_enabled boolean not null default true,
  add column if not exists battle_enabled boolean not null default true,
  add column if not exists countdown_enabled boolean not null default true,
  add column if not exists announcements_enabled boolean not null default true,
  add column if not exists events_enabled boolean not null default false,
  add column if not exists portfolio_enabled boolean not null default false,
  add column if not exists support_enabled boolean not null default true,
  add column if not exists community_enabled boolean not null default true,
  add column if not exists newsletter_enabled boolean not null default true;

create table if not exists public.creator_auth (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  task_id text,
  source text,
  route text,
  referrer text,
  session_id text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_type_idx on public.analytics_events (event_type);
create index if not exists analytics_events_route_idx on public.analytics_events (route);
create index if not exists analytics_events_task_id_idx on public.analytics_events (task_id);

create table if not exists public.creator_connections (
  id uuid primary key default gen_random_uuid(),
  creator_slug text not null,
  provider text not null,
  status text not null default 'not_connected',
  username text,
  external_id text,
  access_token_encrypted text,
  session_reference text,
  runtime_enabled boolean not null default false,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_connections_provider_check check (provider in ('tiktok')),
  constraint creator_connections_status_check check (status in ('connected', 'not_connected', 'needs_attention', 'disconnected'))
);

create unique index if not exists creator_connections_slug_provider_idx on public.creator_connections (creator_slug, provider);
create index if not exists creator_connections_provider_status_idx on public.creator_connections (provider, status, updated_at desc);

create table if not exists public.creator_live_runtime (
  creator_slug text primary key,
  creator_id uuid,
  platform text not null default 'tiktok',
  username text not null,
  is_live boolean not null default false,
  confirmed boolean not null default false,
  confidence text not null default 'unknown',
  source text not null default 'preview',
  viewer_count integer,
  like_count bigint,
  live_duration text,
  live_started_at timestamptz,
  room_id text,
  live_title text,
  battle_active boolean not null default false,
  battle_opponent text,
  battle_result text,
  battle_win_streak integer,
  battle_updated_at timestamptz,
  gifts jsonb not null default '[]'::jsonb,
  top_gifters jsonb not null default '[]'::jsonb,
  rankings jsonb not null default '[]'::jsonb,
  live_url text,
  checked_at timestamptz not null default now(),
  last_event_at timestamptz,
  stale boolean not null default false,
  stale_after timestamptz not null default (now() + interval '75 seconds'),
  error text,
  capabilities jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists creator_live_runtime_updated_at_idx on public.creator_live_runtime (updated_at desc);

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

create index if not exists creator_poll_votes_creator_poll_idx on public.creator_poll_votes (creator_id, poll_key, created_at desc);
create unique index if not exists creator_poll_votes_soft_dedupe_idx on public.creator_poll_votes (creator_id, poll_key, voter_hash);

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

create index if not exists creator_newsletter_signups_creator_idx on public.creator_newsletter_signups (creator_id, created_at desc);
create unique index if not exists creator_newsletter_signups_soft_dedupe_idx on public.creator_newsletter_signups (creator_id, email_hash);

alter table public.creators enable row level security;
alter table public.creator_auth enable row level security;
alter table public.analytics_events enable row level security;
alter table public.creator_connections enable row level security;
alter table public.creator_live_runtime enable row level security;
alter table public.creator_poll_votes enable row level security;
alter table public.creator_newsletter_signups enable row level security;

grant select on public.creators to anon, authenticated;
grant all on public.creators to service_role;
grant all on public.creator_auth to service_role;
grant select, insert on public.analytics_events to service_role;
grant select, insert, update, delete on public.creator_connections to service_role;
grant select, insert, update, delete on public.creator_live_runtime to service_role;
grant select, insert, update, delete on public.creator_poll_votes to service_role;
grant select, insert, update, delete on public.creator_newsletter_signups to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creators' and policyname = 'creators_public_read') then
    create policy "creators_public_read" on public.creators for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creators' and policyname = 'service_role_manages_creators') then
    create policy "service_role_manages_creators" on public.creators for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_auth' and policyname = 'service_role_manages_creator_auth') then
    create policy "service_role_manages_creator_auth" on public.creator_auth for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'analytics_events' and policyname = 'service_role_writes_analytics_events') then
    create policy "service_role_writes_analytics_events" on public.analytics_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_connections' and policyname = 'service_role_manages_creator_connections') then
    create policy "service_role_manages_creator_connections" on public.creator_connections for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_live_runtime' and policyname = 'service_role_manages_creator_live_runtime') then
    create policy "service_role_manages_creator_live_runtime" on public.creator_live_runtime for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_poll_votes' and policyname = 'service_role_manages_creator_poll_votes') then
    create policy "service_role_manages_creator_poll_votes" on public.creator_poll_votes for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_newsletter_signups' and policyname = 'service_role_manages_creator_newsletter_signups') then
    create policy "service_role_manages_creator_newsletter_signups" on public.creator_newsletter_signups for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

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

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'creator_media_public_read') then
    create policy "creator_media_public_read" on storage.objects for select using (bucket_id = 'creator-media');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'service_role_manages_creator_media') then
    create policy "service_role_manages_creator_media" on storage.objects for all using (bucket_id = 'creator-media' and auth.role() = 'service_role') with check (bucket_id = 'creator-media' and auth.role() = 'service_role');
  end if;
end $$;

update public.creators
   set capabilities = jsonb_build_object(
         'live', true,
         'battle', true,
         'countdown', true,
         'announcements', true,
         'events', false,
         'portfolio', false,
         'business', true,
         'newsletter', true,
         'community', true,
         'support', true,
         'shop', false,
         'music', false,
         'ai_assistant', false,
         'timeline', false,
         'featured_project', false,
         'resources', false,
         'gallery', false,
         'testimonials', false,
         'wishlist', false
       ),
       live_enabled = true,
       battle_enabled = true,
       countdown_enabled = true,
       announcements_enabled = true,
       support_enabled = true,
       community_enabled = true,
       newsletter_enabled = true,
       events_enabled = false,
       portfolio_enabled = false
 where slug in ('mosyaamosya', 'mina');

do $$
begin
  if not exists (select 1 from public.creators where slug = 'mosyaamosya')
     and exists (select 1 from public.creators where username = 'mosyaamosya') then
    update public.creators
       set slug = 'mosyaamosya',
           display_name = coalesce(nullif(display_name, ''), 'Mina Mosya'),
           bio = coalesce(nullif(bio, ''), 'Daily livestreams, community, and creator updates.'),
           location = coalesce(nullif(location, ''), 'Chicago'),
           timezone = coalesce(nullif(timezone, ''), 'America/Chicago'),
           theme_preset = coalesce(nullif(theme_preset, ''), 'mina'),
           creator_dna = coalesce(nullif(creator_dna, ''), 'streamer'),
           tiktok_live_username = coalesce(nullif(tiktok_live_username, ''), 'mosyaamosya'),
           community_state = coalesce(nullif(community_state, ''), 'open'),
           updated_at = now()
     where username = 'mosyaamosya';
  end if;
end $$;

insert into public.creators (
  display_name,
  username,
  slug,
  bio,
  location,
  timezone,
  tiktok_url,
  discord_url,
  tiktok_coins_url,
  business_email,
  live_button_text,
  theme_preset,
  creator_dna,
  tiktok_live_username,
  auto_live_detection_enabled,
  manual_live_fallback_enabled,
  live_enabled,
  battle_enabled,
  countdown_enabled,
  announcements_enabled,
  events_enabled,
  portfolio_enabled,
  support_enabled,
  community_enabled,
  newsletter_enabled,
  community_state,
  faq_visible,
  discord_visible,
  creator_passport_visible,
  discord_link_visible,
  discord_link_title,
  discord_link_subtitle,
  discord_link_cta_label,
  tiktok_link_visible,
  tiktok_link_title,
  tiktok_link_subtitle,
  tiktok_link_cta_label,
  battle_link_visible,
  battle_link_title,
  battle_link_subtitle,
  battle_link_cta_label,
  support_link_visible,
  support_link_title,
  support_link_subtitle,
  support_link_cta_label,
  business_link_visible,
  business_link_title,
  business_link_subtitle,
  business_link_cta_label,
  community_link_visible,
  community_link_title,
  community_link_subtitle,
  community_link_cta_label,
  community_link_url,
  share_link_visible,
  public_page_order,
  updated_at
) values (
  'Mina Mosya',
  'mosyaamosya',
  'mosyaamosya',
  'Daily livestreams, community, and creator updates.',
  'Chicago',
  'America/Chicago',
  'https://www.tiktok.com/@mosyaamosya',
  'https://discord.gg/GGE7WsUZR',
  'https://www.tiktok.com/coin',
  'mina@doneovernight.com',
  'Join Live',
  'mina',
  'streamer',
  'mosyaamosya',
  true,
  true,
  true,
  true,
  true,
  true,
  false,
  false,
  true,
  true,
  true,
  'open',
  true,
  true,
  true,
  true,
  'Discord',
  'Community',
  'Join',
  true,
  'TikTok',
  '@mosyaamosya',
  'Watch',
  true,
  'Prepare for Battle',
  'Get your TikTok Coins before the battle begins.',
  'Prepare',
  false,
  'Support Me',
  'Every contribution helps me create more content.',
  'Support',
  true,
  'Business',
  'Booking and collabs',
  'Email',
  true,
  'Community',
  'Join Mina''s Discord for stream updates and community drops.',
  'Join Discord',
  'https://discord.gg/GGE7WsUZR',
  true,
  '["community","discord","tiktok","prepare","support","business","music","faq","poll","newsletter","announcement","countdown","share"]'::jsonb,
  now()
) on conflict (slug) do update set
  display_name = coalesce(nullif(public.creators.display_name, ''), excluded.display_name),
  username = case
    when public.creators.username = ''
      and not exists (
        select 1
          from public.creators existing_creator
         where existing_creator.username = 'mosyaamosya'
           and existing_creator.id <> public.creators.id
      )
    then excluded.username
    else public.creators.username
  end,
  bio = coalesce(nullif(public.creators.bio, ''), excluded.bio),
  location = coalesce(nullif(public.creators.location, ''), excluded.location),
  timezone = coalesce(nullif(public.creators.timezone, ''), excluded.timezone),
  tiktok_url = coalesce(nullif(public.creators.tiktok_url, ''), excluded.tiktok_url),
  discord_url = coalesce(nullif(public.creators.discord_url, ''), excluded.discord_url),
  tiktok_coins_url = coalesce(nullif(public.creators.tiktok_coins_url, ''), excluded.tiktok_coins_url),
  business_email = coalesce(nullif(public.creators.business_email, ''), excluded.business_email),
  live_button_text = coalesce(nullif(public.creators.live_button_text, ''), excluded.live_button_text),
  theme_preset = coalesce(nullif(public.creators.theme_preset, ''), excluded.theme_preset),
  creator_dna = coalesce(nullif(public.creators.creator_dna, ''), excluded.creator_dna),
  tiktok_live_username = coalesce(nullif(public.creators.tiktok_live_username, ''), excluded.tiktok_live_username),
  auto_live_detection_enabled = excluded.auto_live_detection_enabled,
  manual_live_fallback_enabled = excluded.manual_live_fallback_enabled,
  live_enabled = true,
  battle_enabled = true,
  countdown_enabled = true,
  announcements_enabled = true,
  events_enabled = false,
  portfolio_enabled = false,
  support_enabled = true,
  community_enabled = true,
  newsletter_enabled = true,
  community_state = coalesce(nullif(public.creators.community_state, ''), excluded.community_state),
  faq_visible = true,
  discord_visible = true,
  creator_passport_visible = true,
  discord_link_visible = true,
  tiktok_link_visible = true,
  battle_link_visible = true,
  support_link_visible = public.creators.support_link_visible,
  business_link_visible = public.creators.business_link_visible,
  community_link_visible = true,
  share_link_visible = true,
  public_page_order = case
    when public.creators.public_page_order = '[]'::jsonb then excluded.public_page_order
    else public.creators.public_page_order
  end,
  updated_at = case
    when public.creators.display_name = ''
      or public.creators.username = ''
      or public.creators.bio = ''
      or public.creators.location = ''
      or public.creators.timezone = ''
      or public.creators.tiktok_live_username = ''
      or public.creators.community_state = ''
      or public.creators.public_page_order = '[]'::jsonb
    then now()
    else public.creators.updated_at
  end;

insert into public.creator_auth (
  creator_id,
  password_hash,
  updated_at
) values (
  (select id from public.creators where slug = 'mosyaamosya'),
  'pbkdf2_sha256$120000$preview_creator_seed$j_0xTHz4ZPe0XxAYiaqjR_LkRFHuuxCnKbY-d6IW34c',
  now()
) on conflict (creator_id) do nothing;

do $$
begin
  if not exists (select 1 from public.creators where slug = 'preview-creator')
     and exists (select 1 from public.creators where username = 'preview-creator') then
    update public.creators
       set slug = 'preview-creator',
           display_name = coalesce(nullif(display_name, ''), 'Preview Creator'),
           bio = coalesce(nullif(bio, ''), 'Preview-only Creator OS test account.'),
           location = coalesce(nullif(location, ''), 'Preview'),
           timezone = coalesce(nullif(timezone, ''), 'UTC'),
           tiktok_live_username = coalesce(nullif(tiktok_live_username, ''), 'preview-creator'),
           community_state = coalesce(nullif(community_state, ''), 'open'),
           updated_at = now()
     where username = 'preview-creator';
  end if;
end $$;

insert into public.creators (
  display_name,
  username,
  slug,
  bio,
  location,
  timezone,
  tiktok_live_username,
  community_state,
  live_enabled,
  battle_enabled,
  countdown_enabled,
  announcements_enabled,
  events_enabled,
  portfolio_enabled,
  support_enabled,
  community_enabled,
  newsletter_enabled,
  public_page_order,
  updated_at
) values (
  'Preview Creator',
  'preview-creator',
  'preview-creator',
  'Preview-only Creator OS test account.',
  'Preview',
  'UTC',
  'preview-creator',
  'open',
  true,
  true,
  true,
  true,
  false,
  false,
  true,
  true,
  true,
  '["community","tiktok","prepare","support","business","newsletter","countdown","share"]'::jsonb,
  now()
) on conflict (slug) do update set
  display_name = coalesce(nullif(public.creators.display_name, ''), excluded.display_name),
  username = case
    when public.creators.username = ''
      and not exists (
        select 1
          from public.creators existing_creator
         where existing_creator.username = 'preview-creator'
           and existing_creator.id <> public.creators.id
      )
    then excluded.username
    else public.creators.username
  end,
  bio = coalesce(nullif(public.creators.bio, ''), excluded.bio),
  location = coalesce(nullif(public.creators.location, ''), excluded.location),
  timezone = coalesce(nullif(public.creators.timezone, ''), excluded.timezone),
  tiktok_live_username = coalesce(nullif(public.creators.tiktok_live_username, ''), excluded.tiktok_live_username),
  community_state = coalesce(nullif(public.creators.community_state, ''), excluded.community_state),
  live_enabled = excluded.live_enabled,
  battle_enabled = excluded.battle_enabled,
  countdown_enabled = excluded.countdown_enabled,
  announcements_enabled = excluded.announcements_enabled,
  events_enabled = excluded.events_enabled,
  portfolio_enabled = excluded.portfolio_enabled,
  support_enabled = excluded.support_enabled,
  community_enabled = excluded.community_enabled,
  newsletter_enabled = excluded.newsletter_enabled,
  public_page_order = case
    when public.creators.public_page_order = '[]'::jsonb then excluded.public_page_order
    else public.creators.public_page_order
  end,
  updated_at = case
    when public.creators.display_name = ''
      or public.creators.username = ''
      or public.creators.bio = ''
      or public.creators.location = ''
      or public.creators.timezone = ''
      or public.creators.tiktok_live_username = ''
      or public.creators.community_state = ''
      or public.creators.public_page_order = '[]'::jsonb
    then now()
    else public.creators.updated_at
  end;

insert into public.creator_auth (
  creator_id,
  password_hash,
  updated_at
) values (
  (select id from public.creators where slug = 'preview-creator'),
  'pbkdf2_sha256$120000$preview_creator_seed$j_0xTHz4ZPe0XxAYiaqjR_LkRFHuuxCnKbY-d6IW34c',
  now()
) on conflict (creator_id) do update set
  password_hash = excluded.password_hash,
  updated_at = now();

insert into public.creators (
  display_name,
  username,
  slug,
  bio,
  location,
  timezone,
  avatar_url,
  banner_url,
  hero_image_url,
  hero_video_url,
  instagram_url,
  business_email,
  live_url,
  live_status,
  live_button_text,
  theme_preset,
  creator_dna,
  tiktok_live_username,
  welcome_intro_enabled,
  auto_live_detection_enabled,
  manual_live_fallback_enabled,
  live_enabled,
  battle_enabled,
  countdown_enabled,
  announcements_enabled,
  events_enabled,
  portfolio_enabled,
  support_enabled,
  community_enabled,
  newsletter_enabled,
  community_state,
  quick_announcement,
  faq_visible,
  discord_visible,
  creator_passport_visible,
  discord_link_visible,
  tiktok_link_visible,
  battle_link_visible,
  support_link_visible,
  business_link_visible,
  music_link_visible,
  faq_link_visible,
  community_link_visible,
  share_link_visible,
  subscribe_popup_enabled,
  subscribe_popup_title,
  subscribe_popup_copy,
  newsletter_cta_label,
  newsletter_destination,
  custom_links,
  public_page_order,
  updated_at
) values (
  'Lara Jade',
  'larajadev',
  'lara',
  'Creative founder and cultural operator building worlds across fashion, nightlife, research, and studio production.',
  'Amsterdam',
  'Europe/Amsterdam',
  '',
  '',
  '',
  '',
  'https://www.instagram.com/larajadev/',
  '',
  '',
  false,
  'Explore',
  'editorial',
  'editorial',
  'larajadev',
  false,
  false,
  true,
  false,
  false,
  true,
  true,
  true,
  true,
  false,
  false,
  true,
  'hidden',
  '',
  false,
  false,
  true,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  true,
  true,
  'Studio Notes',
  'Notes on culture, rooms, experiments, and the brands Lara is building.',
  'Join Studio Notes',
  '',
  '[
    {
      "id": "currently-building",
      "visible": true,
      "title": "Currently Building",
      "subtitle": "Pretty Girl World, Pretty Girls Like Trap Music, and Provoke Labs - culture, rooms, and research in motion.",
      "cta_label": "Explore",
      "url": "https://prettygirlworld.nl"
    },
    {
      "id": "pretty-girl-world",
      "visible": true,
      "title": "Pretty Girl World",
      "subtitle": "A women-centered playground for taste, culture, and change.",
      "cta_label": "Enter World",
      "url": "https://prettygirlworld.nl"
    },
    {
      "id": "pretty-girls-like-trap-music",
      "visible": true,
      "title": "Pretty Girls Like Trap Music",
      "subtitle": "Nightlife, sound, and cultural moments for the girls who set the tone.",
      "cta_label": "View Events",
      "url": "https://linktr.ee/pgltm"
    },
    {
      "id": "provoke-labs",
      "visible": true,
      "title": "Provoke Labs",
      "subtitle": "Creative research lab and production studio for campaigns, worlds, and experiments.",
      "cta_label": "Visit Studio",
      "url": "https://www.provokelabs.com"
    },
    {
      "id": "events",
      "visible": true,
      "title": "Events",
      "subtitle": "Rooms, releases, and cultural moments curated with intention.",
      "cta_label": "View Events",
      "url": "https://linktr.ee/pgltm"
    },
    {
      "id": "portfolio-work",
      "visible": true,
      "title": "Portfolio / Work",
      "subtitle": "Creative direction, campaign concepts, production, and brand worlds.",
      "cta_label": "View Work",
      "url": "https://www.provokelabs.com"
    },
    {
      "id": "business-collaborations",
      "visible": true,
      "title": "Business / Collaborations",
      "subtitle": "Partnerships, creative direction, campaigns, collaborations, and press.",
      "cta_label": "Work With Me",
      "url": "https://www.instagram.com/larajadev/"
    },
    {
      "id": "instagram",
      "visible": true,
      "title": "Instagram",
      "subtitle": "@larajadev",
      "cta_label": "Follow",
      "url": "https://www.instagram.com/larajadev/"
    },
    {
      "id": "contact",
      "visible": false,
      "title": "Contact",
      "subtitle": "Brand, press, and creative inquiries.",
      "cta_label": "Contact",
      "url": "https://www.instagram.com/larajadev/"
    }
  ]'::jsonb,
  '[
    "hero",
    "custom:currently-building",
    "custom:pretty-girl-world",
    "custom:provoke-labs",
    "custom:pretty-girls-like-trap-music",
    "custom:events",
    "custom:portfolio-work",
    "newsletter",
    "custom:business-collaborations",
    "custom:instagram",
    "share"
  ]'::jsonb,
  now()
) on conflict (slug) do update set
  display_name = excluded.display_name,
  username = excluded.username,
  bio = excluded.bio,
  location = excluded.location,
  timezone = excluded.timezone,
  instagram_url = excluded.instagram_url,
  live_status = excluded.live_status,
  live_button_text = excluded.live_button_text,
  theme_preset = excluded.theme_preset,
  creator_dna = excluded.creator_dna,
  tiktok_live_username = excluded.tiktok_live_username,
  welcome_intro_enabled = excluded.welcome_intro_enabled,
  auto_live_detection_enabled = excluded.auto_live_detection_enabled,
  manual_live_fallback_enabled = excluded.manual_live_fallback_enabled,
  live_enabled = excluded.live_enabled,
  battle_enabled = excluded.battle_enabled,
  countdown_enabled = excluded.countdown_enabled,
  announcements_enabled = excluded.announcements_enabled,
  events_enabled = excluded.events_enabled,
  portfolio_enabled = excluded.portfolio_enabled,
  support_enabled = excluded.support_enabled,
  community_enabled = excluded.community_enabled,
  newsletter_enabled = excluded.newsletter_enabled,
  community_state = excluded.community_state,
  faq_visible = excluded.faq_visible,
  discord_visible = excluded.discord_visible,
  creator_passport_visible = excluded.creator_passport_visible,
  discord_link_visible = excluded.discord_link_visible,
  tiktok_link_visible = excluded.tiktok_link_visible,
  battle_link_visible = excluded.battle_link_visible,
  support_link_visible = excluded.support_link_visible,
  business_link_visible = excluded.business_link_visible,
  music_link_visible = excluded.music_link_visible,
  faq_link_visible = excluded.faq_link_visible,
  community_link_visible = excluded.community_link_visible,
  share_link_visible = excluded.share_link_visible,
  subscribe_popup_enabled = excluded.subscribe_popup_enabled,
  subscribe_popup_title = excluded.subscribe_popup_title,
  subscribe_popup_copy = excluded.subscribe_popup_copy,
  newsletter_cta_label = excluded.newsletter_cta_label,
  newsletter_destination = excluded.newsletter_destination,
  custom_links = excluded.custom_links,
  public_page_order = excluded.public_page_order,
  updated_at = now();

insert into public.creator_auth (
  creator_id,
  password_hash,
  updated_at
) values (
  (select id from public.creators where slug = 'lara'),
  'pbkdf2_sha256$120000$lara_preview_seed$mo_gvgkib2T9KAmVgyAx_i4so6t87At9rJzTQvSIvJM',
  now()
) on conflict (creator_id) do update set
  password_hash = excluded.password_hash,
  updated_at = now();

update public.creators
   set capabilities = jsonb_build_object(
         'live', true,
         'battle', true,
         'countdown', true,
         'announcements', true,
         'events', false,
         'portfolio', false,
         'business', false,
         'newsletter', true,
         'community', true,
         'support', true,
         'shop', false,
         'music', false,
         'ai_assistant', false,
         'timeline', false,
         'featured_project', false,
         'resources', false,
         'gallery', false,
         'testimonials', false,
         'wishlist', false
       ),
       live_enabled = true,
       battle_enabled = true,
       countdown_enabled = true,
       announcements_enabled = true,
       events_enabled = false,
       portfolio_enabled = false,
       support_enabled = true,
       community_enabled = true,
       newsletter_enabled = true
 where slug = 'preview-creator';

update public.creators
   set capabilities = jsonb_build_object(
         'live', false,
         'battle', false,
         'countdown', false,
         'announcements', true,
         'events', true,
         'portfolio', true,
         'business', true,
         'newsletter', true,
         'community', false,
         'support', false,
         'shop', false,
         'music', false,
         'ai_assistant', false,
         'timeline', true,
         'featured_project', true,
         'resources', false,
         'gallery', false,
         'testimonials', false,
         'wishlist', false
       ),
       live_enabled = false,
       battle_enabled = false,
       countdown_enabled = false,
       announcements_enabled = true,
       events_enabled = true,
       portfolio_enabled = true,
       support_enabled = false,
       community_enabled = false,
       newsletter_enabled = true,
       tiktok_welcome_title = 'Open in browser',
       tiktok_welcome_message = 'For the best experience, please open this page in your browser.' || E'\n\n' || 'Tap the ⋯ in the top-right corner and choose Open in browser.',
       tiktok_welcome_primary_label = 'Continue in TikTok',
       tiktok_welcome_secondary_label = 'Continue in TikTok',
       tiktok_welcome_gate_title = 'Open in browser',
       tiktok_welcome_gate_message = 'For the best experience, please open this page in your browser.' || E'\n\n' || 'Tap the ⋯ in the top-right corner and choose Open in browser.',
       tiktok_welcome_gate_primary_label = 'Continue in TikTok',
       tiktok_welcome_gate_secondary_label = 'Continue in TikTok',
       tiktok_welcome_gate_copy_label = 'Copy Link'
 where slug = 'lara';

insert into public.creator_live_runtime (
  creator_slug,
  creator_id,
  username,
  is_live,
  confirmed,
  confidence,
  source,
  checked_at,
  stale,
  stale_after,
  updated_at
) values (
  'preview-creator',
  (select id from public.creators where slug = 'preview-creator'),
  'preview-creator',
  false,
  true,
  'preview',
  'preview',
  now(),
  false,
  now() + interval '75 seconds',
  now()
) on conflict (creator_slug) do update set
  creator_id = excluded.creator_id,
  username = excluded.username,
  is_live = excluded.is_live,
  confirmed = excluded.confirmed,
  confidence = excluded.confidence,
  source = excluded.source,
  checked_at = now(),
  stale = false,
  stale_after = now() + interval '75 seconds',
  updated_at = now();

insert into public.creator_live_runtime (
  creator_slug,
  creator_id,
  username,
  is_live,
  confirmed,
  confidence,
  source,
  checked_at,
  stale,
  stale_after,
  updated_at
) values (
  'lara',
  (select id from public.creators where slug = 'lara'),
  'larajadev',
  false,
  true,
  'preview',
  'preview',
  now(),
  false,
  now() + interval '75 seconds',
  now()
) on conflict (creator_slug) do update set
  creator_id = excluded.creator_id,
  username = excluded.username,
  is_live = excluded.is_live,
  confirmed = excluded.confirmed,
  confidence = excluded.confidence,
  source = excluded.source,
  checked_at = now(),
  stale = false,
  stale_after = now() + interval '75 seconds',
  updated_at = now();
