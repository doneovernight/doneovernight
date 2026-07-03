alter table if exists public.creators
  add column if not exists faq_items jsonb not null default '[]'::jsonb;

update public.creators
set
  faq_link_title = coalesce(nullif(faq_link_title, ''), 'Frequently Asked on Stream'),
  faq_link_subtitle = coalesce(nullif(faq_link_subtitle, ''), 'Quick answers from Mina''s livestreams.'),
  faq_link_cta_label = coalesce(nullif(faq_link_cta_label, ''), 'Read'),
  faq_items = coalesce(faq_items, '[]'::jsonb)
where slug = 'mosyaamosya';
