-- Reliable primary clock for the existing guarded X publisher.
-- Supabase pg_cron only invokes the protected production endpoint; it does not
-- contain a second publishing implementation. CRON_SECRET is encrypted in
-- Supabase Vault and never appears in cron.job or public telemetry.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $preflight$
begin
  if to_regclass('public.workspaces') is null then
    raise exception 'public.workspaces must exist before installing the primary scheduler';
  end if;
end
$preflight$ language plpgsql;

create table if not exists public.x_scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  scheduler_source text not null check (scheduler_source in (
    'supabase_pg_cron', 'github_watchdog', 'github_manual', 'internal_manual'
  )),
  idempotency_key text not null,
  intended_trigger_at timestamptz not null,
  actual_trigger_at timestamptz not null,
  delay_ms bigint not null default 0 check (delay_ms >= 0),
  status text not null default 'running' check (status in (
    'running', 'completed', 'skipped', 'failed'
  )),
  result jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.x_scheduler_leases (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lease_name text not null,
  holder_key text not null,
  acquired_at timestamptz not null,
  expires_at timestamptz not null,
  released_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, lease_name),
  check (expires_at >= acquired_at)
);

create index if not exists x_scheduler_runs_workspace_actual_idx
  on public.x_scheduler_runs(workspace_id, actual_trigger_at desc);
create index if not exists x_scheduler_runs_workspace_status_idx
  on public.x_scheduler_runs(workspace_id, status, actual_trigger_at desc);
create index if not exists x_scheduler_leases_expiry_idx
  on public.x_scheduler_leases(expires_at);

alter table public.x_scheduler_runs enable row level security;
alter table public.x_scheduler_leases enable row level security;

revoke all on table public.x_scheduler_runs from public, anon, authenticated;
revoke all on table public.x_scheduler_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.x_scheduler_runs to service_role;
grant select, insert, update, delete on table public.x_scheduler_leases to service_role;

create or replace function public.claim_x_scheduler_run(
  p_workspace_id uuid,
  p_scheduler_source text,
  p_idempotency_key text,
  p_intended_trigger_at timestamptz,
  p_actual_trigger_at timestamptz,
  p_delay_ms bigint,
  p_lease_seconds integer default 240
)
returns table(run_id uuid, claimed boolean, disposition text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_run_id uuid;
  v_holder_key text;
  v_now timestamptz := clock_timestamp();
  v_ttl integer := greatest(30, least(coalesce(p_lease_seconds, 240), 600));
begin
  if p_workspace_id is null
     or p_scheduler_source not in ('supabase_pg_cron', 'github_watchdog', 'github_manual', 'internal_manual')
     or nullif(btrim(p_idempotency_key), '') is null
     or p_intended_trigger_at is null
     or p_actual_trigger_at is null
     or coalesce(p_delay_ms, -1) < 0 then
    raise exception 'Invalid scheduler claim' using errcode = '22023';
  end if;

  insert into public.x_scheduler_runs (
    workspace_id, scheduler_source, idempotency_key,
    intended_trigger_at, actual_trigger_at, delay_ms, status
  ) values (
    p_workspace_id, p_scheduler_source, btrim(p_idempotency_key),
    p_intended_trigger_at, p_actual_trigger_at, p_delay_ms, 'running'
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    select scheduler_run.id into v_run_id
      from public.x_scheduler_runs scheduler_run
     where scheduler_run.workspace_id = p_workspace_id
       and scheduler_run.idempotency_key = btrim(p_idempotency_key);
    return query select v_run_id, false, 'duplicate'::text;
    return;
  end if;

  insert into public.x_scheduler_leases (
    workspace_id, lease_name, holder_key, acquired_at, expires_at, released_at, updated_at
  ) values (
    p_workspace_id, 'autonomy_publish', btrim(p_idempotency_key), v_now,
    v_now + make_interval(secs => v_ttl), null, v_now
  )
  on conflict (workspace_id, lease_name) do update
     set holder_key = excluded.holder_key,
         acquired_at = excluded.acquired_at,
         expires_at = excluded.expires_at,
         released_at = null,
         updated_at = excluded.updated_at
   where public.x_scheduler_leases.expires_at <= v_now
      or public.x_scheduler_leases.released_at is not null
  returning holder_key into v_holder_key;

  if v_holder_key is null then
    update public.x_scheduler_runs
       set status = 'skipped',
           result = jsonb_build_object('reason', 'overlapping_trigger'),
           completed_at = v_now,
           updated_at = v_now
     where id = v_run_id;
    return query select v_run_id, false, 'overlapping_trigger'::text;
    return;
  end if;

  return query select v_run_id, true, 'claimed'::text;
end
$function$;

create or replace function public.release_x_scheduler_lease(
  p_workspace_id uuid,
  p_lease_name text,
  p_holder_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_released boolean := false;
begin
  update public.x_scheduler_leases
     set expires_at = least(expires_at, clock_timestamp()),
         released_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where workspace_id = p_workspace_id
     and lease_name = btrim(p_lease_name)
     and holder_key = btrim(p_holder_key)
  returning true into v_released;
  return coalesce(v_released, false);
end
$function$;

create or replace function public.invoke_x_publisher_scheduler()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $function$
declare
  v_secret text;
  v_now timestamptz := clock_timestamp();
  v_intended timestamptz;
  v_request_id bigint;
begin
  v_intended := date_trunc('hour', v_now)
    + floor(extract(minute from v_now) / 5) * interval '5 minutes';

  select secret.decrypted_secret into v_secret
    from vault.decrypted_secrets secret
   where secret.name = 'doneovernight_x_publisher_cron_secret'
   order by secret.created_at desc
   limit 1;

  if nullif(v_secret, '') is null then
    raise exception 'Primary scheduler credential is unavailable' using errcode = '22023';
  end if;

  select net.http_post(
    url := 'https://doneovernight.com/api/x-content-autonomy-publish',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret,
      'X-Scheduler-Source', 'supabase_pg_cron',
      'X-Scheduler-Intended-At', to_char(v_intended at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end
$function$;

create or replace function public.install_x_publisher_scheduler(p_cron_secret text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, vault, cron
as $function$
declare
  v_secret_id uuid;
  v_job_id bigint;
  v_existing_job_id bigint;
begin
  if p_cron_secret is null
     or octet_length(p_cron_secret) < 16
     or octet_length(p_cron_secret) > 1024
     or p_cron_secret <> btrim(p_cron_secret)
     or position(chr(10) in p_cron_secret) > 0
     or position(chr(13) in p_cron_secret) > 0 then
    raise exception 'Invalid scheduler credential' using errcode = '22023';
  end if;

  select secret.id into v_secret_id
    from vault.secrets secret
   where secret.name = 'doneovernight_x_publisher_cron_secret'
   order by secret.created_at desc
   limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      p_cron_secret,
      'doneovernight_x_publisher_cron_secret',
      'CRON_SECRET for the DONEOVERNIGHT primary X publisher scheduler'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_cron_secret,
      'doneovernight_x_publisher_cron_secret',
      'CRON_SECRET for the DONEOVERNIGHT primary X publisher scheduler'
    );
  end if;

  for v_existing_job_id in
    select job.jobid from cron.job job
     where job.jobname = 'doneovernight-x-publisher-primary-5m'
  loop
    perform cron.unschedule(v_existing_job_id);
  end loop;

  select cron.schedule(
    'doneovernight-x-publisher-primary-5m',
    '*/5 * * * *',
    'select public.invoke_x_publisher_scheduler();'
  ) into v_job_id;

  return jsonb_build_object(
    'primary', 'Supabase pg_cron',
    'job_name', 'doneovernight-x-publisher-primary-5m',
    'job_id', v_job_id,
    'cadence', '*/5 * * * *',
    'endpoint', '/api/x-content-autonomy-publish',
    'watchdog', 'GitHub Actions'
  );
end
$function$;

revoke all on function public.claim_x_scheduler_run(uuid, text, text, timestamptz, timestamptz, bigint, integer) from public, anon, authenticated;
revoke all on function public.release_x_scheduler_lease(uuid, text, text) from public, anon, authenticated;
revoke all on function public.invoke_x_publisher_scheduler() from public, anon, authenticated, service_role;
revoke all on function public.install_x_publisher_scheduler(text) from public, anon, authenticated;
grant execute on function public.claim_x_scheduler_run(uuid, text, text, timestamptz, timestamptz, bigint, integer) to service_role;
grant execute on function public.release_x_scheduler_lease(uuid, text, text) to service_role;
grant execute on function public.install_x_publisher_scheduler(text) to service_role;

commit;
