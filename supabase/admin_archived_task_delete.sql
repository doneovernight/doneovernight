create or replace function public.admin_delete_archived_task(
  p_task_row_id text default '',
  p_task_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.task_requests%rowtype;
  v_task_json jsonb;
  v_archived boolean := false;
begin
  if nullif(trim(coalesce(p_task_row_id, '')), '') is null
     and nullif(trim(coalesce(p_task_id, '')), '') is null then
    return jsonb_build_object(
      'success', false,
      'code', 'DELETE_ROW_NOT_FOUND',
      'error', 'No task id was provided.',
      'rows_deleted', 0
    );
  end if;

  select *
    into v_task
    from public.task_requests
   where (
      nullif(trim(coalesce(p_task_row_id, '')), '') is not null
      and id::text = trim(p_task_row_id)
    )
    or (
      nullif(trim(coalesce(p_task_id, '')), '') is not null
      and task_id = trim(p_task_id)
    )
   limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'DELETE_ROW_NOT_FOUND',
      'error', 'Archived task row was not found.',
      'rows_deleted', 0
    );
  end if;

  v_task_json := to_jsonb(v_task);
  v_archived :=
    lower(coalesce(v_task_json->>'status', '')) = 'archived'
    or lower(coalesce(v_task_json->>'archived', 'false')) = 'true'
    or lower(coalesce(v_task_json->'raw_payload'->>'archived', 'false')) = 'true';

  if not v_archived then
    return jsonb_build_object(
      'success', false,
      'code', 'DELETE_NOT_ALLOWED_NOT_ARCHIVED',
      'error', 'Task is not archived.',
      'rows_deleted', 0,
      'deleted_task', jsonb_build_object(
        'id', v_task_json->>'id',
        'task_id', v_task_json->>'task_id',
        'status', v_task_json->>'status'
      )
    );
  end if;

  delete from public.task_requests
   where id::text = v_task_json->>'id';

  return jsonb_build_object(
    'success', true,
    'rows_deleted', 1,
    'deleted_task', jsonb_build_object(
      'id', v_task_json->>'id',
      'task_id', v_task_json->>'task_id',
      'status', v_task_json->>'status'
    )
  );
end;
$$;

revoke all on function public.admin_delete_archived_task(text, text) from public;
revoke all on function public.admin_delete_archived_task(text, text) from anon;
revoke all on function public.admin_delete_archived_task(text, text) from authenticated;
grant execute on function public.admin_delete_archived_task(text, text) to service_role;
