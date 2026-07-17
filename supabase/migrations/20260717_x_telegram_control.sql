-- DONEOVERNIGHT Telegram Control: short-lived, one-time server-side actions only.
-- This table stores opaque callback state, never provider or X credentials.

create table if not exists public.x_telegram_control_events (
  id uuid primary key default gen_random_uuid(),
  callback_token text not null unique,
  action text not null check (action in (
    'approve', 'undo_approval', 'reject_start', 'reject_reason', 'regenerate',
    'keep_original', 'schedule_menu', 'schedule_recommended', 'schedule_today',
    'schedule_tomorrow', 'schedule_custom', 'schedule_cancel', 'publish_start', 'publish_confirm',
    'publish_cancel', 'control_status', 'control_discovery', 'control_autonomy',
    'control_review_next', 'control_publish_queue', 'control_pause_discovery',
    'control_pause_drafting', 'control_pause_scheduling', 'control_pause_replies',
    'control_pause_confirm', 'control_kill_start', 'control_kill_confirm', 'open_dashboard'
  )),
  draft_id uuid references public.x_drafts(id) on delete cascade,
  chat_id text not null,
  user_id text not null,
  message_id bigint,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  notes text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists x_telegram_control_events_message_idx
  on public.x_telegram_control_events(chat_id, message_id, created_at desc);
create index if not exists x_telegram_control_events_expiry_idx
  on public.x_telegram_control_events(expires_at) where consumed_at is null;

alter table public.x_telegram_control_events enable row level security;

grant select, insert, update, delete on table public.x_telegram_control_events to service_role;
