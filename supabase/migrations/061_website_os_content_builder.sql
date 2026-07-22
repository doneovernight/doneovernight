-- Persistent Website OS content drafts, atomic publishing, version history and media.

create extension if not exists pgcrypto;

create or replace function public.website_os_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.website_os_content_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.website_os_workspaces(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft', 'ready', 'published', 'disabled')),
  revision integer not null default 1 check (revision > 0),
  base_published_version integer,
  updated_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_os_content_drafts_object check (jsonb_typeof(content) = 'object')
);

create table if not exists public.website_os_content_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content jsonb not null,
  lifecycle_status text not null default 'published' check (lifecycle_status in ('published', 'disabled')),
  published_by uuid references public.website_os_users(id) on delete set null,
  published_at timestamptz not null default now(),
  source_version_id uuid references public.website_os_content_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, version_number),
  constraint website_os_content_versions_object check (jsonb_typeof(content) = 'object')
);

create table if not exists public.website_os_content_state (
  workspace_id uuid primary key references public.website_os_workspaces(id) on delete cascade,
  published_version_id uuid not null references public.website_os_content_versions(id) on delete restrict,
  published_config jsonb not null,
  published_at timestamptz not null,
  published_by uuid references public.website_os_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint website_os_content_state_object check (jsonb_typeof(published_config) = 'object')
);

create table if not exists public.website_os_media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  filename text not null,
  storage_bucket text,
  storage_path text,
  public_url text,
  mime_type text not null,
  byte_size bigint not null default 0 check (byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  alt_text text not null default '',
  category text not null default 'other',
  variant_kind text not null default 'original' check (variant_kind in ('original', 'desktop', 'mobile')),
  variants jsonb not null default '{}'::jsonb,
  usage jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'ready', 'hidden', 'archived', 'trashed')),
  is_test boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.website_os_users(id) on delete set null,
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  replaced_at timestamptz,
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_os_media_assets_location check (
    (storage_bucket is null and storage_path is null) or
    (storage_bucket is not null and storage_path is not null and public_url is not null)
  )
);

-- Migration 058 may already own this table. Extend it without replacing records.
alter table public.website_os_media_assets add column if not exists variant_kind text not null default 'original';
alter table public.website_os_media_assets add column if not exists variants jsonb not null default '{}'::jsonb;
alter table public.website_os_media_assets add column if not exists usage jsonb not null default '[]'::jsonb;
alter table public.website_os_media_assets add column if not exists updated_by uuid references public.website_os_users(id) on delete set null;
alter table public.website_os_media_assets add column if not exists replaced_at timestamptz;
alter table public.website_os_media_assets add column if not exists checksum text;
alter table public.website_os_media_assets drop constraint if exists website_os_media_assets_storage_location;
alter table public.website_os_media_assets drop constraint if exists website_os_media_assets_location;
alter table public.website_os_media_assets add constraint website_os_media_assets_location check (
  (storage_bucket is null and storage_path is null) or
  (storage_bucket is not null and storage_path is not null and public_url is not null)
);

create index if not exists website_os_content_versions_workspace_published_idx
  on public.website_os_content_versions (workspace_id, version_number desc, published_at desc);
create index if not exists website_os_media_assets_workspace_status_idx
  on public.website_os_media_assets (workspace_id, status, updated_at desc);
create unique index if not exists website_os_media_assets_workspace_storage_idx
  on public.website_os_media_assets (workspace_id, storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null and deleted_at is null;

drop trigger if exists website_os_content_drafts_touch_updated_at on public.website_os_content_drafts;
create trigger website_os_content_drafts_touch_updated_at before update on public.website_os_content_drafts
  for each row execute function public.website_os_touch_updated_at();
drop trigger if exists website_os_media_assets_touch_updated_at on public.website_os_media_assets;
create trigger website_os_media_assets_touch_updated_at before update on public.website_os_media_assets
  for each row execute function public.website_os_touch_updated_at();

create or replace function public.website_os_save_content_draft(
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_content jsonb,
  p_lifecycle_status text default 'draft'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_draft public.website_os_content_drafts%rowtype;
  saved_draft public.website_os_content_drafts%rowtype;
  normalized_status text := lower(coalesce(p_lifecycle_status, 'draft'));
begin
  if jsonb_typeof(p_content) <> 'object' then raise exception 'CONTENT_DRAFT_INVALID' using errcode = '22023'; end if;
  if normalized_status not in ('draft', 'ready', 'published', 'disabled') then raise exception 'CONTENT_STATUS_INVALID' using errcode = '22023'; end if;
  if not exists (select 1 from public.website_os_users where id = p_user_id and workspace_id = p_workspace_id and active = true) then
    raise exception 'CONTENT_USER_WORKSPACE_MISMATCH' using errcode = '42501';
  end if;
  select * into current_draft from public.website_os_content_drafts where workspace_id = p_workspace_id for update;
  if current_draft.id is null then
    if coalesce(p_expected_revision, 0) <> 0 then raise exception 'CONTENT_DRAFT_CONFLICT' using errcode = '40001'; end if;
    insert into public.website_os_content_drafts (workspace_id, content, lifecycle_status, revision, updated_by)
      values (p_workspace_id, p_content, normalized_status, 1, p_user_id) returning * into saved_draft;
  else
    if current_draft.revision <> p_expected_revision then raise exception 'CONTENT_DRAFT_CONFLICT' using errcode = '40001'; end if;
    update public.website_os_content_drafts
      set content = p_content, lifecycle_status = normalized_status, revision = revision + 1, updated_by = p_user_id
      where id = current_draft.id returning * into saved_draft;
  end if;
  return to_jsonb(saved_draft);
end;
$$;

create or replace function public.website_os_publish_content(
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_content jsonb,
  p_lifecycle_status text default 'published'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_draft public.website_os_content_drafts%rowtype;
  next_version integer;
  new_version public.website_os_content_versions%rowtype;
  new_state public.website_os_content_state%rowtype;
  now_value timestamptz := now();
  normalized_status text := lower(coalesce(p_lifecycle_status, 'published'));
begin
  if jsonb_typeof(p_content) <> 'object' then raise exception 'CONTENT_PUBLISH_INVALID' using errcode = '22023'; end if;
  if normalized_status not in ('published', 'disabled') then raise exception 'CONTENT_STATUS_INVALID' using errcode = '22023'; end if;
  if not exists (select 1 from public.website_os_users where id = p_user_id and workspace_id = p_workspace_id and active = true and role in ('Owner', 'Admin', 'Editor')) then
    raise exception 'CONTENT_PUBLISH_PERMISSION_DENIED' using errcode = '42501';
  end if;
  select * into current_draft from public.website_os_content_drafts where workspace_id = p_workspace_id for update;
  if current_draft.id is null or current_draft.revision <> p_expected_revision then
    raise exception 'CONTENT_DRAFT_CONFLICT' using errcode = '40001';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_version from public.website_os_content_versions where workspace_id = p_workspace_id;
  insert into public.website_os_content_versions (workspace_id, version_number, content, lifecycle_status, published_by, published_at)
    values (p_workspace_id, next_version, p_content, normalized_status, p_user_id, now_value) returning * into new_version;
  insert into public.website_os_content_state (workspace_id, published_version_id, published_config, published_at, published_by, updated_at)
    values (p_workspace_id, new_version.id, p_content, now_value, p_user_id, now_value)
    on conflict (workspace_id) do update set
      published_version_id = excluded.published_version_id,
      published_config = excluded.published_config,
      published_at = excluded.published_at,
      published_by = excluded.published_by,
      updated_at = excluded.updated_at
    returning * into new_state;
  update public.website_os_content_drafts set
    content = p_content,
    lifecycle_status = normalized_status,
    revision = revision + 1,
    base_published_version = next_version,
    updated_by = p_user_id
    where id = current_draft.id returning * into current_draft;
  return jsonb_build_object('draft', to_jsonb(current_draft), 'version', to_jsonb(new_version), 'state', to_jsonb(new_state));
end;
$$;

create or replace function public.website_os_rollback_content(
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_version_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_version public.website_os_content_versions%rowtype;
  current_draft public.website_os_content_drafts%rowtype;
  next_version integer;
  rollback_version public.website_os_content_versions%rowtype;
  new_state public.website_os_content_state%rowtype;
  now_value timestamptz := now();
begin
  if not exists (select 1 from public.website_os_users where id = p_user_id and workspace_id = p_workspace_id and active = true and role in ('Owner', 'Admin')) then
    raise exception 'CONTENT_ROLLBACK_PERMISSION_DENIED' using errcode = '42501';
  end if;
  select * into source_version from public.website_os_content_versions where id = p_version_id and workspace_id = p_workspace_id;
  if source_version.id is null then raise exception 'CONTENT_VERSION_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into current_draft from public.website_os_content_drafts where workspace_id = p_workspace_id for update;
  if current_draft.id is null or current_draft.revision <> p_expected_revision then raise exception 'CONTENT_DRAFT_CONFLICT' using errcode = '40001'; end if;
  select coalesce(max(version_number), 0) + 1 into next_version from public.website_os_content_versions where workspace_id = p_workspace_id;
  insert into public.website_os_content_versions (workspace_id, version_number, content, lifecycle_status, published_by, published_at, source_version_id)
    values (p_workspace_id, next_version, source_version.content, source_version.lifecycle_status, p_user_id, now_value, source_version.id)
    returning * into rollback_version;
  insert into public.website_os_content_state (workspace_id, published_version_id, published_config, published_at, published_by, updated_at)
    values (p_workspace_id, rollback_version.id, source_version.content, now_value, p_user_id, now_value)
    on conflict (workspace_id) do update set
      published_version_id = excluded.published_version_id,
      published_config = excluded.published_config,
      published_at = excluded.published_at,
      published_by = excluded.published_by,
      updated_at = excluded.updated_at
    returning * into new_state;
  update public.website_os_content_drafts set
    content = source_version.content,
    lifecycle_status = source_version.lifecycle_status,
    revision = revision + 1,
    base_published_version = next_version,
    updated_by = p_user_id
    where id = current_draft.id returning * into current_draft;
  return jsonb_build_object('draft', to_jsonb(current_draft), 'version', to_jsonb(rollback_version), 'state', to_jsonb(new_state));
end;
$$;

revoke all on function public.website_os_save_content_draft(uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.website_os_publish_content(uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.website_os_rollback_content(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.website_os_save_content_draft(uuid, uuid, integer, jsonb, text) to service_role;
grant execute on function public.website_os_publish_content(uuid, uuid, integer, jsonb, text) to service_role;
grant execute on function public.website_os_rollback_content(uuid, uuid, integer, uuid) to service_role;

alter table public.website_os_content_drafts enable row level security;
alter table public.website_os_content_versions enable row level security;
alter table public.website_os_content_state enable row level security;
alter table public.website_os_media_assets enable row level security;
grant select, insert, update, delete on public.website_os_content_drafts to service_role;
grant select, insert, update, delete on public.website_os_content_versions to service_role;
grant select, insert, update, delete on public.website_os_content_state to service_role;
grant select, insert, update, delete on public.website_os_media_assets to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('website-os-media', 'website-os-media', true, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = true, file_size_limit = 4194304,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

do $$
declare
  workspace_uuid uuid;
  owner_uuid uuid;
  legacy_config jsonb;
  seeded_config jsonb;
  seeded_version public.website_os_content_versions%rowtype;
begin
  select id into workspace_uuid from public.website_os_workspaces where slug = 'cp' and status = 'active' limit 1;
  if workspace_uuid is null then return; end if;
  select id into owner_uuid from public.website_os_users where workspace_id = workspace_uuid and role = 'Owner' and active = true order by created_at limit 1;
  select coalesce(raw_payload->'config', '{}'::jsonb) into legacy_config
    from public.task_requests where source = 'commonpl4ce_site_config' order by updated_at desc limit 1;
  legacy_config := coalesce(legacy_config, '{}'::jsonb);
  seeded_config := legacy_config || jsonb_build_object(
    'schemaVersion', 2,
    'workspace', 'commonpl4ce',
    'sections', jsonb_build_array(
      jsonb_build_object('id','hero','name','Hero','type','Full-screen visual','visibility','Published','enabled',true,'kicker','Opening archive','heading','Hero','body',coalesce(legacy_config#>>'{content,heroLine}','Available for campaigns, editorials and selected brand projects.')),
      jsonb_build_object('id','story','name','Story / Behind the Film','type','Two-column story','visibility','Published','enabled',true,'kicker','','heading','Shot with feeling.','body','CP creates visual stories for brands, campaigns and people who want their imagery to feel real.','secondaryBody','Film slows everything down. It forces attention, preserves texture and keeps the small imperfections that make a moment believable.','smallLine','For brands that need more than clean content: imagery with mood, memory and presence.','ctaLabel','Start your project','ctaLink','https://doneovernight.com/cp-book'),
      jsonb_build_object('id','what-we-create','name','What We Create','type','Text block','visibility','Published','enabled',true,'kicker','What we create','heading','Visuals that keep a pulse.','items',jsonb_build_array(
        jsonb_build_object('title','Campaigns','body','Visual stories for launches, collections and brand moments.'), jsonb_build_object('title','Editorials','body','Images with atmosphere, rhythm and point of view.'), jsonb_build_object('title','Brand Stories','body','Content that feels lived-in instead of overproduced.'), jsonb_build_object('title','Travel Narratives','body','Location-based imagery for brands moving beyond one place.'), jsonb_build_object('title','Portraits','body','People captured with softness, presence and intention.'))),
      jsonb_build_object('id','novateur','name','Novateur / Selected Client','type','Campaign / project block','visibility','Published','enabled',true,'kicker','Selected client','heading','NOVATEUR STUDIOS','meta','Campaign / 2026\nIndependent clothing brand.','body','A campaign story built around fabric, movement and the feeling of clothes being lived in.','desktopImage','/assets/common-place/novateur/novateur-studios-logo.png','video','/assets/common-place/novateur/novateur-campaign-film.mp4','gallery',(
        select jsonb_agg(jsonb_build_object('src',format('/assets/common-place/novateur/novateur-client-%s.jpg', lpad(i::text,2,'0')),'alt',format('Novateur campaign image %s',lpad(i::text,2,'0')),'variant',case when i in (1,5,11,12) then 'wide' else 'standard' end) order by i) from generate_series(1,17) i
      ),'links',jsonb_build_array(jsonb_build_object('label','Website','url','https://novateurclo.com'),jsonb_build_object('label','Instagram','url','https://instagram.com/novateur'))),
      jsonb_build_object('id','process','name','Process','type','Text block','visibility','Published','enabled',true,'kicker','Process','heading','Calm direction before the shutter.','items',jsonb_build_array(
        jsonb_build_object('title','Direction','body','Mood, references, location and the feeling the images need to carry.'),jsonb_build_object('title','Production','body','A calm shoot process shaped around light, styling, movement and timing.'),jsonb_build_object('title','Delivery','body','A curated selection of images ready for socials, campaigns, websites or press.'))),
      jsonb_build_object('id','who-this-is-for','name','Who This Is For','type','Text block','visibility','Published','enabled',true,'kicker','Who this is for','heading','Intentional, not overproduced.','items',jsonb_build_array('Fashion','Hospitality','Creative Brands','Artists','Founders','Lifestyle Projects'),'body','For brands and people who want visuals that feel intentional without losing the realness of the moment.'),
      jsonb_build_object('id','behind-romy','name','Behind Romy','type','Image block','visibility','Published','enabled',true,'kicker','Behind the Film','heading','Romy Peters','body','COMMONPL4CE is shaped by Romy Peters, a photographer working between fashion, lifestyle, travel and documentary storytelling.','secondaryBody','Her work is built around feeling: quiet direction, real presence and images that carry texture beyond the moment.\n\nSelected projects can be captured on Kodak film to preserve grain, atmosphere and the small imperfections that make a visual feel alive.','desktopImage','/assets/common-place/romy/romy-behind-film.jpg','mobileImage','/assets/common-place/romy/romy-behind-film.jpg','alt','Romy Peters photographing on location'),
      jsonb_build_object('id','availability','name','Availability','type','Text block','visibility','Published','enabled',true,'kicker','Availability','heading','Currently Booking','body','Netherlands\nEurope\nWorldwide','secondaryBody','Available for campaigns,\neditorials and selected brand projects.','smallLine','Limited availability each month.'),
      jsonb_build_object('id','booking','name','Booking','type','Booking CTA','visibility','Published','enabled',true,'kicker','Book a shoot','heading','Book a shoot','body','Tell me what you have in mind.','ctaLabel','Book a shoot','ctaLink','https://doneovernight.com/cp-book'),
      jsonb_build_object('id','faq','name','FAQ','type','FAQ','visibility','Published','enabled',true,'kicker','BEFORE WE WORK TOGETHER','heading','Questions worth answering.','body','Every project is different.\n\nThese are simply the questions people ask most often before we begin.','defaultOpenId','faq-1','questions',jsonb_build_array(
        jsonb_build_object('id','faq-1','question','What kind of projects do you usually work on?','answer','We work with fashion labels, creative brands, founders, restaurants, campaigns, products, editorial projects and people who care deeply about visual identity.','enabled',true),
        jsonb_build_object('id','faq-2','question','Do I need a complete concept before contacting you?','answer','Not at all.\n\nSome projects begin with a finished campaign.\n\nOthers start with a conversation.\n\nWe shape the direction together before production begins.','enabled',true),
        jsonb_build_object('id','faq-3','question','How does a project usually work?','answer','Every project starts with understanding the goal.\n\nFrom there we plan the creative direction, prepare production, shoot, edit and deliver.\n\nThe process stays personal from beginning to end.','enabled',true),
        jsonb_build_object('id','faq-4','question','How long does delivery take?','answer','Every production is different.\n\nSmaller shoots can often be delivered much faster than larger campaigns.\n\nBefore we start you''ll always know what to expect.','enabled',true),
        jsonb_build_object('id','faq-5','question','Why invest in professional photography?','answer','Photography often creates the first impression people have of your business.\n\nStrong imagery builds trust, consistency and a visual identity that lasts far beyond a single campaign.','enabled',true),
        jsonb_build_object('id','faq-6','question','Can you travel?','answer','Yes.\n\nProjects are not limited by location.\n\nTravel is planned together depending on the production.','enabled',true),
        jsonb_build_object('id','faq-7','question','How is pricing determined?','answer','Every production is built around the project itself.\n\nInstead of forcing predefined packages, each proposal reflects the creative direction, preparation, production and delivery required.','enabled',true),
        jsonb_build_object('id','faq-8','question','What happens after I book?','answer','You''ll receive confirmation.\n\nWe discuss the creative direction.\n\nPlan the production.\n\nComplete the shoot.\n\nEdit everything carefully.\n\nDeliver the final work.','enabled',true)
      ),'closingKicker','STILL WONDERING?','closingBody','If your question isn''t here, we''ll happily answer it before we ever start shooting.','ctaLabel','Ask COMMONPL4CE','ctaLink','mailto:book@commonpl4ce.com?subject=Question%20for%20COMMONPL4CE'),
      jsonb_build_object('id','footer','name','Footer','type','Footer','visibility','Published','enabled',true,'body','COMMONPL4CE','secondaryBody','Available worldwide','desktopImage','/assets/common-place/final/wordmark.png','contactEmail','book@commonpl4ce.com','socialLabel','Instagram','socialUrl','https://instagram.com/commonpl4ce')
    )
  );
  if not exists (select 1 from public.website_os_content_versions where workspace_id = workspace_uuid) then
    insert into public.website_os_content_versions (workspace_id, version_number, content, lifecycle_status, published_by, published_at)
      values (workspace_uuid, 1, seeded_config, 'published', owner_uuid, now()) returning * into seeded_version;
    insert into public.website_os_content_state (workspace_id, published_version_id, published_config, published_at, published_by)
      values (workspace_uuid, seeded_version.id, seeded_config, seeded_version.published_at, owner_uuid);
    insert into public.website_os_content_drafts (workspace_id, content, lifecycle_status, revision, base_published_version, updated_by)
      values (workspace_uuid, seeded_config, 'published', 1, 1, owner_uuid);
  end if;

  insert into public.website_os_media_assets (
    workspace_id, filename, public_url, mime_type, alt_text, category, variant_kind,
    usage, status, created_by, updated_by
  )
  select workspace_uuid, asset.filename, asset.public_url, asset.mime_type, asset.alt_text,
    asset.category, asset.variant_kind, asset.usage, 'ready', owner_uuid, owner_uuid
  from (values
    ('slide-01-opening.jpg','/assets/common-place/fullscreen/slide-01-opening.jpg','image/jpeg','Romy standing with her back toward the camera','Hero','desktop','["Desktop Hero 01"]'::jsonb),
    ('slide-02-yellow.jpg','/assets/common-place/fullscreen/slide-02-yellow.jpg','image/jpeg','Yellow sweater portrait on film','Hero','desktop','["Desktop Hero 02"]'::jsonb),
    ('slide-03-hoodie-front.jpg','/assets/common-place/fullscreen/slide-03-hoodie-front.jpg','image/jpeg','Hoodie portrait seated on a bench','Hero','desktop','["Desktop Hero 03"]'::jsonb),
    ('slide-04-chair.jpg','/assets/common-place/fullscreen/slide-04-chair.jpg','image/jpeg','Editorial chair portrait on film','Hero','desktop','["Desktop Hero 04"]'::jsonb),
    ('slide-05-duo.jpg','/assets/common-place/fullscreen/slide-05-duo.jpg','image/jpeg','Duo portrait in yellow campaign styling','Hero','desktop','["Desktop Hero 05"]'::jsonb),
    ('slide-06-couch.jpg','/assets/common-place/fullscreen/slide-06-couch.jpg','image/jpeg','Campaign image with couch and hoodie','Hero','desktop','["Desktop Hero 06"]'::jsonb),
    ('slide-07-profile.jpg','/assets/common-place/fullscreen/slide-07-profile.jpg','image/jpeg','Side profile hoodie campaign image','Hero','desktop','["Desktop Hero 07"]'::jsonb),
    ('slide-01-mobile.jpg','/assets/common-place/mobile/slide-01-mobile.jpg','image/jpeg','Romy standing with her back toward the camera','Hero','mobile','["Mobile Hero 01"]'::jsonb),
    ('slide-02-mobile.jpg','/assets/common-place/mobile/slide-02-mobile.jpg','image/jpeg','Yellow sweater portrait on film','Hero','mobile','["Mobile Hero 02"]'::jsonb),
    ('slide-03-mobile.jpg','/assets/common-place/mobile/slide-03-mobile.jpg','image/jpeg','Hoodie portrait seated on a bench','Hero','mobile','["Mobile Hero 03"]'::jsonb),
    ('slide-04-mobile.jpg','/assets/common-place/mobile/slide-04-mobile.jpg','image/jpeg','Editorial chair portrait on film','Hero','mobile','["Mobile Hero 04"]'::jsonb),
    ('slide-05-mobile.jpg','/assets/common-place/mobile/slide-05-mobile.jpg','image/jpeg','Duo portrait in yellow campaign styling','Hero','mobile','["Mobile Hero 05"]'::jsonb),
    ('slide-06-mobile.jpg','/assets/common-place/mobile/slide-06-mobile.jpg','image/jpeg','Campaign image with couch and hoodie','Hero','mobile','["Mobile Hero 06"]'::jsonb),
    ('slide-07-mobile.jpg','/assets/common-place/mobile/slide-07-mobile.jpg','image/jpeg','Side profile hoodie campaign image','Hero','mobile','["Mobile Hero 07"]'::jsonb),
    ('romy-behind-film.jpg','/assets/common-place/romy/romy-behind-film.jpg','image/jpeg','Romy Peters photographing on location','Behind the Film','original','["Behind the Film"]'::jsonb),
    ('wordmark-intro-commonpl4ce.png','/assets/common-place/final/wordmark-intro-commonpl4ce.png','image/png','COMMONPL4CE wordmark','Logo','original','["Header","Login"]'::jsonb),
    ('novateur-studios-logo.png','/assets/common-place/novateur/novateur-studios-logo.png','image/png','Novateur Studios logo','Projects','original','["Novateur / Selected Client"]'::jsonb)
  ) as asset(filename, public_url, mime_type, alt_text, category, variant_kind, usage)
  where not exists (
    select 1 from public.website_os_media_assets existing
    where existing.workspace_id = workspace_uuid and existing.public_url = asset.public_url and existing.deleted_at is null
  );

  insert into public.website_os_media_assets (
    workspace_id, filename, public_url, mime_type, alt_text, category, variant_kind,
    usage, status, created_by, updated_by
  )
  select workspace_uuid,
    format('novateur-client-%s.jpg', lpad(i::text, 2, '0')),
    format('/assets/common-place/novateur/novateur-client-%s.jpg', lpad(i::text, 2, '0')),
    'image/jpeg', format('Novateur campaign image %s', lpad(i::text, 2, '0')),
    'Projects', 'original', '["Novateur / Selected Client"]'::jsonb, 'ready', owner_uuid, owner_uuid
  from generate_series(1, 17) i
  where not exists (
    select 1 from public.website_os_media_assets existing
    where existing.workspace_id = workspace_uuid
      and existing.public_url = format('/assets/common-place/novateur/novateur-client-%s.jpg', lpad(i::text, 2, '0'))
      and existing.deleted_at is null
  );

  insert into public.website_os_media_assets (
    workspace_id, filename, public_url, mime_type, alt_text, category, variant_kind,
    usage, status, created_by, updated_by
  )
  select workspace_uuid, 'novateur-campaign-film.mp4', '/assets/common-place/novateur/novateur-campaign-film.mp4',
    'video/mp4', 'Novateur campaign film', 'Video', 'original', '["Novateur / Selected Client"]'::jsonb,
    'ready', owner_uuid, owner_uuid
  where not exists (
    select 1 from public.website_os_media_assets existing
    where existing.workspace_id = workspace_uuid and existing.public_url = '/assets/common-place/novateur/novateur-campaign-film.mp4' and existing.deleted_at is null
  );
end;
$$;
