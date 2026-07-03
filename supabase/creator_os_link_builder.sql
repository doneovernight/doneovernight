-- Creator OS link builder fields

alter table if exists public.creators
  add column if not exists newsletter_destination text not null default '',
  add column if not exists faq_link_visible boolean not null default false,
  add column if not exists faq_link_title text not null default 'FAQ',
  add column if not exists faq_link_subtitle text not null default 'Questions and answers',
  add column if not exists faq_link_cta_label text not null default 'Open',
  add column if not exists faq_link_url text not null default '',
  add column if not exists community_link_url text not null default '',
  add column if not exists custom_links jsonb not null default '[]'::jsonb,
  add column if not exists quick_poll text not null default '';

update public.creators
set
  newsletter_destination = coalesce(newsletter_destination, ''),
  faq_link_visible = coalesce(faq_link_visible, false),
  faq_link_title = coalesce(nullif(faq_link_title, ''), 'FAQ'),
  faq_link_subtitle = coalesce(nullif(faq_link_subtitle, ''), 'Questions and answers'),
  faq_link_cta_label = coalesce(nullif(faq_link_cta_label, ''), 'Open'),
  faq_link_url = coalesce(faq_link_url, ''),
  community_link_url = coalesce(nullif(community_link_url, ''), nullif(discord_invite_url, ''), nullif(discord_url, ''), 'https://discord.gg/GGE7WsUZR'),
  custom_links = coalesce(custom_links, '[]'::jsonb),
  quick_poll = coalesce(quick_poll, ''),
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111'
   or slug = 'mosyaamosya';
