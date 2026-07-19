-- Business-level optimistic-lock conflicts must return immediately through
-- PostgREST. SQLSTATE 40001 is reserved for transaction serialization errors
-- and may be retried until the server request times out.

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
    if coalesce(p_expected_revision, 0) <> 0 then raise exception 'CONTENT_DRAFT_CONFLICT' using errcode = 'P0001'; end if;
    insert into public.website_os_content_drafts (workspace_id, content, lifecycle_status, revision, updated_by)
      values (p_workspace_id, p_content, normalized_status, 1, p_user_id) returning * into saved_draft;
  else
    if current_draft.revision <> p_expected_revision then raise exception 'CONTENT_DRAFT_CONFLICT' using errcode = 'P0001'; end if;
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
    raise exception 'CONTENT_DRAFT_CONFLICT' using errcode = 'P0001';
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
  if current_draft.id is null or current_draft.revision <> p_expected_revision then raise exception 'CONTENT_DRAFT_CONFLICT' using errcode = 'P0001'; end if;
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
