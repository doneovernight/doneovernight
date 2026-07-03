-- Creator OS admin IA/runtime fields

alter table if exists public.creators
  add column if not exists pinned_block text not null default '',
  add column if not exists community_state text not null default 'open',
  add column if not exists quick_announcement text not null default '',
  add column if not exists faq_visible boolean not null default true,
  add column if not exists discord_visible boolean not null default true,
  add column if not exists creator_passport_visible boolean not null default true;

update public.creators
set
  pinned_block = coalesce(pinned_block, ''),
  community_state = coalesce(community_state, 'open'),
  quick_announcement = coalesce(quick_announcement, ''),
  faq_visible = coalesce(faq_visible, true),
  discord_visible = coalesce(discord_visible, true),
  creator_passport_visible = coalesce(creator_passport_visible, true),
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111'
   or slug = 'mosyaamosya';
