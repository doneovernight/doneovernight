-- Workspace-scoped business identity, legal documents, policies and immutable acceptances.

begin;

create extension if not exists pgcrypto;

create table if not exists public.website_os_business_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.website_os_workspaces(id) on delete cascade,
  business_name text not null,
  legal_name text not null default '',
  company_number text not null default '',
  vat_number text not null default '',
  business_address text not null default '',
  phone text not null default '',
  business_email text not null default '',
  website text not null default '',
  instagram text not null default '',
  tiktok text not null default '',
  linkedin text not null default '',
  logo_media_id uuid references public.website_os_media_assets(id) on delete set null,
  wordmark_media_id uuid references public.website_os_media_assets(id) on delete set null,
  logo_url text not null default '',
  wordmark_url text not null default '',
  brand_colors jsonb not null default '[]'::jsonb,
  invoice_prefix text not null default '',
  invoice_footer text not null default '',
  business_signature text not null default '',
  timezone text not null default 'Europe/Amsterdam',
  currency text not null default 'EUR',
  language text not null default 'nl',
  revision integer not null default 1 check (revision > 0),
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_os_business_profile_colors check (
    jsonb_typeof(brand_colors) = 'array' and jsonb_array_length(brand_colors) <= 8
  ),
  constraint website_os_business_profile_currency check (currency ~ '^[A-Z]{3}$'),
  constraint website_os_business_profile_language check (language in ('en', 'nl'))
);

create table if not exists public.website_os_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  hostname text not null,
  domain_type text not null default 'custom' check (domain_type in ('custom', 'subdomain')),
  connection_status text not null default 'pending' check (connection_status in ('verified', 'pending', 'disconnected')),
  verification_status text not null default 'pending' check (verification_status in ('verified', 'pending', 'failed', 'not_started')),
  verification_method text not null default 'none' check (verification_method in ('none', 'manual', 'dns')),
  ssl_status text not null default 'pending' check (ssl_status in ('active', 'pending', 'failed', 'not_started')),
  is_primary boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  verified_at timestamptz,
  disconnected_at timestamptz,
  verification_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, hostname)
);

create unique index if not exists website_os_domains_primary_idx
  on public.website_os_domains (workspace_id) where is_primary = true and connection_status <> 'disconnected';
create index if not exists website_os_domains_workspace_status_idx
  on public.website_os_domains (workspace_id, connection_status, updated_at desc);

create table if not exists public.website_os_email_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.website_os_workspaces(id) on delete cascade,
  business_email text not null default '',
  reply_to_email text not null default '',
  display_name text not null default '',
  signature text not null default '',
  connection_type text not null default 'other' check (connection_type in ('google_workspace', 'microsoft_365', 'smtp', 'other')),
  verification_status text not null default 'not_started' check (verification_status in ('verified', 'pending', 'failed', 'not_started')),
  connection_status text not null default 'disconnected' check (connection_status in ('connected', 'pending', 'disconnected', 'error')),
  provider_metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_os_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  document_type text not null check (document_type in (
    'general_terms', 'booking_policy', 'payment_policy', 'cancellation_policy',
    'privacy_policy', 'cookie_policy', 'invoice_terms', 'service_agreement', 'custom'
  )),
  title text not null,
  version_label text not null default '1.0',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  enabled boolean not null default true,
  effective_date date,
  language text not null default 'nl' check (language in ('en', 'nl')),
  internal_notes text not null default '',
  body text not null default '',
  revision integer not null default 1 check (revision > 0),
  published_version_id uuid,
  published_at timestamptz,
  published_by uuid references public.website_os_users(id) on delete set null,
  archived_at timestamptz,
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_os_document_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint website_os_document_body_length check (char_length(body) <= 200000)
);

create unique index if not exists website_os_documents_standard_type_idx
  on public.website_os_documents (workspace_id, document_type)
  where document_type <> 'custom' and status <> 'archived';
create index if not exists website_os_documents_workspace_status_idx
  on public.website_os_documents (workspace_id, status, updated_at desc);

create table if not exists public.website_os_document_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  document_id uuid not null references public.website_os_documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  version_label text not null,
  title text not null,
  body text not null,
  effective_date date,
  language text not null check (language in ('en', 'nl')),
  enabled boolean not null default true,
  published_by uuid references public.website_os_users(id) on delete set null,
  published_at timestamptz not null default now(),
  source_version_id uuid references public.website_os_document_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

alter table public.website_os_documents
  drop constraint if exists website_os_documents_published_version_id_fkey;
alter table public.website_os_documents
  add constraint website_os_documents_published_version_id_fkey
  foreign key (published_version_id) references public.website_os_document_versions(id) on delete restrict;

create index if not exists website_os_document_versions_workspace_document_idx
  on public.website_os_document_versions (workspace_id, document_id, version_number desc);

create table if not exists public.website_os_document_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  document_id uuid not null references public.website_os_documents(id) on delete cascade,
  destination text not null check (destination in (
    'booking_confirmation', 'invoice', 'branded_email', 'customer_welcome',
    'project_start', 'manual_email', 'client_portal'
  )),
  enabled boolean not null default true,
  required boolean not null default false,
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, destination)
);

create index if not exists website_os_document_workflows_workspace_destination_idx
  on public.website_os_document_workflows (workspace_id, destination, enabled);

create table if not exists public.website_os_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  document_id uuid not null references public.website_os_documents(id) on delete restrict,
  policy_key text not null,
  label text not null,
  requirement text not null default 'optional' check (requirement in ('required', 'optional')),
  visibility text not null default 'customer_visible' check (visibility in ('internal', 'customer_visible')),
  enabled boolean not null default true,
  display_order integer not null default 0,
  acceptance_contexts jsonb not null default '["booking"]'::jsonb,
  created_by uuid references public.website_os_users(id) on delete set null,
  updated_by uuid references public.website_os_users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, policy_key),
  unique (workspace_id, document_id),
  constraint website_os_policy_contexts check (
    jsonb_typeof(acceptance_contexts) = 'array' and jsonb_array_length(acceptance_contexts) <= 12
  )
);

create index if not exists website_os_policies_workspace_order_idx
  on public.website_os_policies (workspace_id, enabled, display_order, updated_at desc);

create table if not exists public.website_os_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete restrict,
  policy_id uuid not null references public.website_os_policies(id) on delete restrict,
  document_id uuid not null references public.website_os_documents(id) on delete restrict,
  document_version_id uuid not null references public.website_os_document_versions(id) on delete restrict,
  accepted_version_number integer not null check (accepted_version_number > 0),
  booking_task_id text not null,
  client_id uuid references public.website_os_clients(id) on delete set null,
  customer_name_snapshot text not null default '',
  customer_email_hash text not null default '',
  acceptance_context text not null default 'booking' check (acceptance_context in ('booking', 'invoice', 'project', 'manual')),
  accepted_at timestamptz not null default now(),
  request_fingerprint text not null default '',
  user_agent text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, booking_task_id, policy_id, document_version_id)
);

create index if not exists website_os_policy_acceptances_workspace_booking_idx
  on public.website_os_policy_acceptances (workspace_id, booking_task_id, accepted_at desc);
create index if not exists website_os_policy_acceptances_workspace_client_idx
  on public.website_os_policy_acceptances (workspace_id, client_id, accepted_at desc)
  where client_id is not null;

create table if not exists public.website_os_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  invoice_id uuid not null references public.website_os_invoices(id) on delete cascade,
  document_id uuid not null references public.website_os_documents(id) on delete restrict,
  document_version_id uuid not null references public.website_os_document_versions(id) on delete restrict,
  attachment_source text not null default 'workflow' check (attachment_source in ('workflow', 'manual')),
  attached_by uuid references public.website_os_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (invoice_id, document_version_id)
);

create index if not exists website_os_invoice_documents_workspace_invoice_idx
  on public.website_os_invoice_documents (workspace_id, invoice_id, created_at);

do $$
declare
  target text;
begin
  foreach target in array array[
    'website_os_business_profiles', 'website_os_domains', 'website_os_email_identities',
    'website_os_documents', 'website_os_document_workflows', 'website_os_policies'
  ] loop
    execute format('drop trigger if exists %I on public.%I', target || '_touch_updated_at', target);
    execute format('create trigger %I before update on public.%I for each row execute function public.website_os_touch_updated_at()', target || '_touch_updated_at', target);
  end loop;
end;
$$;

create or replace function public.website_os_save_document_draft(
  p_workspace_id uuid,
  p_user_id uuid,
  p_document_id uuid,
  p_expected_revision integer,
  p_title text,
  p_version_label text,
  p_effective_date date,
  p_language text,
  p_internal_notes text,
  p_body text,
  p_enabled boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_document public.website_os_documents%rowtype;
begin
  if not exists (
    select 1 from public.website_os_users
    where id = p_user_id and workspace_id = p_workspace_id and active = true and role in ('Owner', 'Admin', 'Editor')
  ) then raise exception 'DOCUMENT_PERMISSION_DENIED' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 1 or char_length(coalesce(p_body, '')) > 200000 then
    raise exception 'DOCUMENT_CONTENT_INVALID' using errcode = '22023';
  end if;
  if p_language not in ('en', 'nl') then raise exception 'DOCUMENT_LANGUAGE_INVALID' using errcode = '22023'; end if;

  select * into current_document from public.website_os_documents
    where id = p_document_id and workspace_id = p_workspace_id for update;
  if current_document.id is null then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if current_document.status = 'archived' then raise exception 'DOCUMENT_ARCHIVED' using errcode = '55000'; end if;
  if current_document.revision <> p_expected_revision then raise exception 'DOCUMENT_DRAFT_CONFLICT' using errcode = '40001'; end if;

  update public.website_os_documents set
    title = btrim(p_title),
    version_label = left(btrim(coalesce(p_version_label, '')), 40),
    effective_date = p_effective_date,
    language = p_language,
    internal_notes = left(coalesce(p_internal_notes, ''), 10000),
    body = coalesce(p_body, ''),
    enabled = coalesce(p_enabled, true),
    status = case when published_version_id is null then 'draft' else status end,
    revision = revision + 1,
    updated_by = p_user_id
  where id = current_document.id returning * into current_document;

  return to_jsonb(current_document);
end;
$$;

create or replace function public.website_os_publish_document(
  p_workspace_id uuid,
  p_user_id uuid,
  p_document_id uuid,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_document public.website_os_documents%rowtype;
  next_version integer;
  new_version public.website_os_document_versions%rowtype;
begin
  if not exists (
    select 1 from public.website_os_users
    where id = p_user_id and workspace_id = p_workspace_id and active = true and role in ('Owner', 'Admin')
  ) then raise exception 'DOCUMENT_PUBLISH_PERMISSION_DENIED' using errcode = '42501'; end if;

  select * into current_document from public.website_os_documents
    where id = p_document_id and workspace_id = p_workspace_id for update;
  if current_document.id is null then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if current_document.status = 'archived' then raise exception 'DOCUMENT_ARCHIVED' using errcode = '55000'; end if;
  if current_document.revision <> p_expected_revision then raise exception 'DOCUMENT_DRAFT_CONFLICT' using errcode = '40001'; end if;
  if char_length(btrim(current_document.body)) < 1 then raise exception 'DOCUMENT_BODY_REQUIRED' using errcode = '22023'; end if;

  select coalesce(max(version_number), 0) + 1 into next_version
    from public.website_os_document_versions where document_id = current_document.id;
  insert into public.website_os_document_versions (
    workspace_id, document_id, version_number, version_label, title, body,
    effective_date, language, enabled, published_by, published_at
  ) values (
    p_workspace_id, current_document.id, next_version,
    coalesce(nullif(current_document.version_label, ''), next_version::text),
    current_document.title, current_document.body, current_document.effective_date,
    current_document.language, current_document.enabled, p_user_id, now()
  ) returning * into new_version;

  update public.website_os_documents set
    status = 'active', published_version_id = new_version.id,
    published_at = new_version.published_at, published_by = p_user_id,
    revision = revision + 1, updated_by = p_user_id
  where id = current_document.id returning * into current_document;

  return jsonb_build_object('document', to_jsonb(current_document), 'version', to_jsonb(new_version));
end;
$$;

create or replace function public.website_os_rollback_document(
  p_workspace_id uuid,
  p_user_id uuid,
  p_document_id uuid,
  p_source_version_id uuid,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_document public.website_os_documents%rowtype;
  source_version public.website_os_document_versions%rowtype;
  rollback_version public.website_os_document_versions%rowtype;
  next_version integer;
begin
  if not exists (
    select 1 from public.website_os_users
    where id = p_user_id and workspace_id = p_workspace_id and active = true and role in ('Owner', 'Admin')
  ) then raise exception 'DOCUMENT_ROLLBACK_PERMISSION_DENIED' using errcode = '42501'; end if;

  select * into current_document from public.website_os_documents
    where id = p_document_id and workspace_id = p_workspace_id for update;
  if current_document.id is null then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if current_document.revision <> p_expected_revision then raise exception 'DOCUMENT_DRAFT_CONFLICT' using errcode = '40001'; end if;
  select * into source_version from public.website_os_document_versions
    where id = p_source_version_id and document_id = p_document_id and workspace_id = p_workspace_id;
  if source_version.id is null then raise exception 'DOCUMENT_VERSION_NOT_FOUND' using errcode = 'P0002'; end if;

  select coalesce(max(version_number), 0) + 1 into next_version
    from public.website_os_document_versions where document_id = current_document.id;
  insert into public.website_os_document_versions (
    workspace_id, document_id, version_number, version_label, title, body,
    effective_date, language, enabled, published_by, published_at, source_version_id
  ) values (
    p_workspace_id, current_document.id, next_version, source_version.version_label,
    source_version.title, source_version.body, source_version.effective_date,
    source_version.language, source_version.enabled, p_user_id, now(), source_version.id
  ) returning * into rollback_version;

  update public.website_os_documents set
    title = source_version.title, version_label = source_version.version_label,
    body = source_version.body, effective_date = source_version.effective_date,
    language = source_version.language, enabled = source_version.enabled,
    status = 'active', published_version_id = rollback_version.id,
    published_at = rollback_version.published_at, published_by = p_user_id,
    revision = revision + 1, updated_by = p_user_id
  where id = current_document.id returning * into current_document;

  return jsonb_build_object('document', to_jsonb(current_document), 'version', to_jsonb(rollback_version));
end;
$$;

create or replace function public.website_os_record_policy_acceptances(
  p_workspace_id uuid,
  p_booking_task_id text,
  p_customer_name text,
  p_customer_email_hash text,
  p_policy_ids uuid[],
  p_request_fingerprint text,
  p_user_agent text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_policy record;
  inserted_count integer := 0;
begin
  if coalesce(btrim(p_booking_task_id), '') = '' then raise exception 'POLICY_BOOKING_REQUIRED' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.task_requests
    where website_os_workspace_id = p_workspace_id and task_id = p_booking_task_id
      and lower(coalesce(source, '')) = 'commonpl4ce_booker'
  ) then raise exception 'POLICY_BOOKING_SCOPE_INVALID' using errcode = '42501'; end if;

  if exists (
    select 1 from public.website_os_policies policy
    join public.website_os_documents document on document.id = policy.document_id
    where policy.workspace_id = p_workspace_id and policy.enabled = true
      and policy.archived_at is null and policy.visibility = 'customer_visible'
      and policy.requirement = 'required' and policy.acceptance_contexts ? 'booking'
      and document.status = 'active' and document.enabled = true
      and document.published_version_id is not null
      and not (policy.id = any(coalesce(p_policy_ids, array[]::uuid[])))
  ) then raise exception 'POLICY_REQUIRED_ACCEPTANCE_MISSING' using errcode = '22023'; end if;

  for target_policy in
    select policy.id as policy_id, policy.document_id, document.published_version_id,
      version.version_number
    from public.website_os_policies policy
    join public.website_os_documents document on document.id = policy.document_id
    join public.website_os_document_versions version on version.id = document.published_version_id
    where policy.workspace_id = p_workspace_id and policy.enabled = true
      and policy.archived_at is null and policy.visibility = 'customer_visible'
      and policy.acceptance_contexts ? 'booking' and document.status = 'active'
      and document.enabled = true and policy.id = any(coalesce(p_policy_ids, array[]::uuid[]))
  loop
    insert into public.website_os_policy_acceptances (
      workspace_id, policy_id, document_id, document_version_id,
      accepted_version_number, booking_task_id, customer_name_snapshot,
      customer_email_hash, acceptance_context, request_fingerprint, user_agent
    ) values (
      p_workspace_id, target_policy.policy_id, target_policy.document_id,
      target_policy.published_version_id, target_policy.version_number,
      p_booking_task_id, left(coalesce(p_customer_name, ''), 160),
      left(coalesce(p_customer_email_hash, ''), 128), 'booking',
      left(coalesce(p_request_fingerprint, ''), 128), left(coalesce(p_user_agent, ''), 500)
    ) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.website_os_link_policy_acceptances_to_client(
  p_workspace_id uuid,
  p_user_id uuid,
  p_booking_task_id text,
  p_client_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_count integer := 0;
begin
  if not exists (
    select 1 from public.website_os_users
    where id = p_user_id and workspace_id = p_workspace_id and active = true and role in ('Owner', 'Admin')
  ) then raise exception 'POLICY_CLIENT_LINK_PERMISSION_DENIED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.website_os_clients
    where id = p_client_id and workspace_id = p_workspace_id and deleted_at is null
  ) then raise exception 'POLICY_CLIENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.website_os_client_bookings
    where workspace_id = p_workspace_id and booking_task_id = p_booking_task_id and client_id = p_client_id
  ) then raise exception 'POLICY_BOOKING_CLIENT_SCOPE_INVALID' using errcode = '42501'; end if;
  if exists (
    select 1 from public.website_os_policy_acceptances
    where workspace_id = p_workspace_id and booking_task_id = p_booking_task_id
      and client_id is not null and client_id <> p_client_id
  ) then raise exception 'POLICY_ACCEPTANCE_ALREADY_LINKED' using errcode = '23505'; end if;

  update public.website_os_policy_acceptances
  set client_id = p_client_id
  where workspace_id = p_workspace_id and booking_task_id = p_booking_task_id and client_id is null;
  get diagnostics linked_count = row_count;
  return linked_count;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'website_os_business_profiles', 'website_os_domains', 'website_os_email_identities',
    'website_os_documents', 'website_os_document_versions', 'website_os_document_workflows',
    'website_os_policies', 'website_os_policy_acceptances', 'website_os_invoice_documents'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('revoke all privileges on table public.%I from anon, authenticated', target);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target);
  end loop;
end;
$$;

revoke all on function public.website_os_save_document_draft(uuid, uuid, uuid, integer, text, text, date, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.website_os_publish_document(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.website_os_rollback_document(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.website_os_record_policy_acceptances(uuid, text, text, text, uuid[], text, text)
  from public, anon, authenticated;
revoke all on function public.website_os_link_policy_acceptances_to_client(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.website_os_save_document_draft(uuid, uuid, uuid, integer, text, text, date, text, text, text, boolean)
  to service_role;
grant execute on function public.website_os_publish_document(uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.website_os_rollback_document(uuid, uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.website_os_record_policy_acceptances(uuid, text, text, text, uuid[], text, text)
  to service_role;
grant execute on function public.website_os_link_policy_acceptances_to_client(uuid, uuid, text, uuid)
  to service_role;

-- Published versions and legal acceptance evidence are writable only through the
-- reviewed security-definer functions above. Server repositories retain read access.
revoke insert, update, delete on table public.website_os_document_versions from service_role;
revoke insert, update, delete on table public.website_os_policy_acceptances from service_role;
grant select on table public.website_os_document_versions to service_role;
grant select on table public.website_os_policy_acceptances to service_role;

do $$
declare
  workspace_uuid uuid;
  owner_uuid uuid;
begin
  select id into workspace_uuid from public.website_os_workspaces where slug = 'cp' and status = 'active' limit 1;
  if workspace_uuid is null then return; end if;
  select id into owner_uuid from public.website_os_users
    where workspace_id = workspace_uuid and role = 'Owner' and active = true order by created_at limit 1;

  insert into public.website_os_business_profiles (
    workspace_id, business_name, business_email, website, instagram,
    logo_url, wordmark_url, brand_colors, invoice_prefix, timezone,
    currency, language, created_by, updated_by
  ) values (
    workspace_uuid, 'COMMONPL4CE', 'book@commonpl4ce.com', 'https://doneovernight.com/cp',
    'https://instagram.com/commonpl4ce', '/assets/common-place/final/cp-header-small.png',
    '/assets/common-place/final/wordmark.png', '["#060606","#eee6d5","#f5efe2"]'::jsonb,
    'CP', 'Europe/Amsterdam', 'EUR', 'nl', owner_uuid, owner_uuid
  ) on conflict (workspace_id) do nothing;

  insert into public.website_os_email_identities (
    workspace_id, business_email, reply_to_email, display_name, signature,
    connection_type, verification_status, connection_status, created_by, updated_by
  ) values (
    workspace_uuid, 'book@commonpl4ce.com', 'book@commonpl4ce.com', 'COMMONPL4CE', '',
    'other', 'not_started', 'disconnected', owner_uuid, owner_uuid
  ) on conflict (workspace_id) do nothing;

  insert into public.website_os_domains (
    workspace_id, hostname, domain_type, connection_status, verification_status,
    verification_method, ssl_status, is_primary, verified_at, created_by, updated_by
  ) values (
    workspace_uuid, 'doneovernight.com', 'custom', 'verified', 'verified',
    'manual', 'active', true, now(), owner_uuid, owner_uuid
  ) on conflict (workspace_id, hostname) do nothing;
end;
$$;

commit;
