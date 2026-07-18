-- Production audit coverage for Growth Director and controlled autonomous publishing.
-- Additive and idempotent; RLS remains enabled and only service_role has table privileges.

alter table public.x_autonomy_audit_events
  add column if not exists run_id uuid references public.x_agent_runs(id) on delete set null,
  add column if not exists publication_id uuid references public.x_publications(id) on delete set null,
  add column if not exists mode text check (mode in ('off', 'shadow', 'auto')),
  add column if not exists actor text not null default 'system',
  add column if not exists reason text;

create index if not exists x_autonomy_audit_events_run_created_idx
  on public.x_autonomy_audit_events(run_id, created_at desc);
create index if not exists x_autonomy_audit_events_draft_created_idx
  on public.x_autonomy_audit_events(draft_id, created_at desc);

alter table public.x_autonomy_audit_events enable row level security;
grant select, insert, update, delete on table public.x_autonomy_audit_events to service_role;
