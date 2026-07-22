-- Persist Today Briefing dismissal and snooze state per Website OS user,
-- booking and COMMONPL4CE workspace calendar date.

begin;

create extension if not exists pgcrypto;

create table if not exists public.website_os_today_briefing_dismissals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.website_os_workspaces(id) on delete cascade,
  user_id uuid not null references public.website_os_users(id) on delete cascade,
  booking_task_id text not null,
  briefing_date date not null,
  dismissal_action text not null check (dismissal_action in ('dismissed', 'later', 'viewed')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, booking_task_id, briefing_date)
);

create index if not exists website_os_today_briefing_user_date_idx
  on public.website_os_today_briefing_dismissals (workspace_id, user_id, briefing_date, updated_at desc);

drop trigger if exists website_os_today_briefing_dismissals_touch_updated_at
  on public.website_os_today_briefing_dismissals;
create trigger website_os_today_briefing_dismissals_touch_updated_at
  before update on public.website_os_today_briefing_dismissals
  for each row execute function public.website_os_touch_updated_at();

create or replace function public.website_os_save_today_briefing_state(
  p_workspace_id uuid,
  p_user_id uuid,
  p_booking_task_id text,
  p_briefing_date date,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.website_os_today_briefing_dismissals%rowtype;
begin
  if p_action not in ('dismissed', 'later', 'viewed') then
    raise exception 'TODAY_BRIEFING_ACTION_INVALID' using errcode = '22023';
  end if;
  if coalesce(trim(p_booking_task_id), '') = '' then
    raise exception 'TODAY_BRIEFING_BOOKING_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.website_os_users
    where id = p_user_id and workspace_id = p_workspace_id and active = true
  ) then
    raise exception 'TODAY_BRIEFING_USER_SCOPE_INVALID' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.task_requests
    where website_os_workspace_id = p_workspace_id
      and task_id = p_booking_task_id
      and (
        lower(coalesce(source, '')) = 'commonpl4ce_booker'
        or lower(coalesce(raw_payload->>'intakeVersion', raw_payload->>'intake_version', '')) = 'commonpl4ce_booker_v1'
      )
  ) then
    raise exception 'TODAY_BRIEFING_BOOKING_SCOPE_INVALID' using errcode = '42501';
  end if;

  insert into public.website_os_today_briefing_dismissals (
    workspace_id, user_id, booking_task_id, briefing_date,
    dismissal_action, snoozed_until
  ) values (
    p_workspace_id, p_user_id, p_booking_task_id, p_briefing_date,
    p_action, case when p_action = 'later' then now() + interval '60 minutes' else null end
  )
  on conflict (workspace_id, user_id, booking_task_id, briefing_date)
  do update set
    dismissal_action = excluded.dismissal_action,
    snoozed_until = excluded.snoozed_until,
    updated_at = now()
  returning * into saved;

  insert into public.website_os_audit_events (
    workspace_id, actor_user_id, entity_type, entity_id, action, previous_state, next_state, metadata
  ) values (
    p_workspace_id, p_user_id, 'today_briefing', p_booking_task_id,
    'today_briefing_' || p_action, '{}'::jsonb,
    jsonb_build_object('briefing_date', p_briefing_date, 'dismissal_action', p_action),
    jsonb_build_object('snoozed_until', saved.snoozed_until)
  );

  return jsonb_build_object(
    'bookingTaskId', saved.booking_task_id,
    'briefingDate', saved.briefing_date,
    'action', saved.dismissal_action,
    'snoozedUntil', saved.snoozed_until,
    'updatedAt', saved.updated_at
  );
end;
$$;

alter table public.website_os_today_briefing_dismissals enable row level security;
revoke all privileges on table public.website_os_today_briefing_dismissals from anon, authenticated;
grant select, insert, update, delete on table public.website_os_today_briefing_dismissals to service_role;

revoke all on function public.website_os_save_today_briefing_state(uuid, uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.website_os_save_today_briefing_state(uuid, uuid, text, date, text)
  to service_role;

commit;
