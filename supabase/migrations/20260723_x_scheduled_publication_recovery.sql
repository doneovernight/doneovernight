-- Scheduled publication recovery. Additive and idempotent.
-- This migration expands the V3 schedule lifecycle without deleting rows.
begin;

do $$
begin
  if to_regclass('public.x_autonomy_schedules') is not null then
    execute 'alter table public.x_autonomy_schedules add column if not exists last_eligibility_checked_at timestamptz';
    execute 'alter table public.x_autonomy_schedules add column if not exists last_blocker text';
    execute 'alter table public.x_autonomy_schedules add column if not exists recovery_action text';
    execute 'alter table public.x_autonomy_schedules add column if not exists actual_published_at timestamptz';
  end if;
end
$$ language plpgsql;

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.x_autonomy_schedules') is null then
    return;
  end if;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.x_autonomy_schedules'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.x_autonomy_schedules drop constraint if exists %I', constraint_name);
  end loop;

  alter table public.x_autonomy_schedules
    add constraint x_autonomy_schedules_status_check
    check (status in ('scheduled', 'due', 'publishing', 'published', 'missed', 'failed', 'cancelled', 'superseded', 'shadow', 'delayed'));
exception
  when duplicate_object then null;
end
$$ language plpgsql;

create index if not exists x_autonomy_schedules_due_idx
  on public.x_autonomy_schedules(status, scheduled_for);

commit;
