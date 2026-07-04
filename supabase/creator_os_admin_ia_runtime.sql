-- Creator OS admin IA/runtime fields

alter table if exists public.creators
  add column if not exists pinned_block text not null default '',
  add column if not exists community_state text not null default '',
  add column if not exists quick_announcement text not null default '',
  add column if not exists faq_visible boolean not null default false,
  add column if not exists discord_visible boolean not null default false,
  add column if not exists creator_passport_visible boolean not null default false;
