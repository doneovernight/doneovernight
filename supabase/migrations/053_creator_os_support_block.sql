alter table public.creators
  add column if not exists support_link_visible boolean default false,
  add column if not exists support_link_title text default 'Support Me',
  add column if not exists support_link_subtitle text default 'Every contribution helps me create more content.',
  add column if not exists support_link_cta_label text default 'Support',
  add column if not exists support_link_provider text default 'custom',
  add column if not exists support_link_url text default '',
  add column if not exists support_sticker_enabled boolean default true,
  add column if not exists support_sticker_animation_enabled boolean default true;
