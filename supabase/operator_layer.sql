-- DONEOVERNIGHT minimal operator layer
-- Non-destructive: creates tables/indexes only if they do not already exist.
-- Run this in the Supabase SQL editor before wiring any operator-facing UI.

create extension if not exists pgcrypto;

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique not null,
  status text default 'pending',
  skills text[] default '{}',
  payout_percentage numeric default 50,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.operator_tasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.task_requests(id),
  operator_id uuid references public.operators(id),
  status text default 'offered',
  payout_amount numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists operators_status_idx
  on public.operators (status);

create index if not exists operator_tasks_task_id_idx
  on public.operator_tasks (task_id);

create index if not exists operator_tasks_operator_id_idx
  on public.operator_tasks (operator_id);

create index if not exists operator_tasks_status_idx
  on public.operator_tasks (status);
