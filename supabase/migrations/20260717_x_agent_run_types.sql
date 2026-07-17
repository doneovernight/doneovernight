-- DONEOVERNIGHT X Content Agent. Explicitly align run history validation with production jobs.
-- Keeps validation strict while preserving prior V2 operational run types.

alter table public.x_agent_runs drop constraint if exists x_agent_runs_run_type_check;
alter table public.x_agent_runs add constraint x_agent_runs_run_type_check check (run_type in (
  'discovery',
  'publishing',
  'engagement',
  'analytics',
  'autonomy',
  'autonomy_publish',
  'autonomy_metrics'
));
