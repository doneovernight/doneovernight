-- Creator OS link builder fields

alter table if exists public.creators
  add column if not exists newsletter_destination text not null default '',
  add column if not exists faq_link_visible boolean not null default false,
  add column if not exists faq_link_title text not null default '',
  add column if not exists faq_link_subtitle text not null default '',
  add column if not exists faq_link_cta_label text not null default '',
  add column if not exists faq_link_url text not null default '',
  add column if not exists community_link_url text not null default '',
  add column if not exists custom_links jsonb not null default '[]'::jsonb,
  add column if not exists quick_poll text not null default '';
