alter table public.journey_confirmations add column if not exists selected_language text;
alter table public.journey_confirmations add column if not exists browser_language text;
alter table public.journey_confirmations add column if not exists detected_content_language text;
alter table public.journey_confirmations add column if not exists email_language text;

alter table public.journeys add column if not exists selected_language text;
alter table public.journeys add column if not exists browser_language text;
alter table public.journeys add column if not exists detected_content_language text;
alter table public.journeys add column if not exists email_language text;

alter table public.visitor_progress add column if not exists selected_language text;
alter table public.visitor_progress add column if not exists browser_language text;
alter table public.visitor_progress add column if not exists detected_content_language text;
alter table public.visitor_progress add column if not exists email_language text;

alter table public.viewer_builds add column if not exists selected_language text;
alter table public.viewer_builds add column if not exists browser_language text;
alter table public.viewer_builds add column if not exists detected_content_language text;
alter table public.viewer_builds add column if not exists email_language text;

alter table public.resource_interest add column if not exists selected_language text;
alter table public.resource_interest add column if not exists browser_language text;
alter table public.resource_interest add column if not exists detected_content_language text;
alter table public.resource_interest add column if not exists email_language text;

alter table public.email_events add column if not exists selected_language text;
alter table public.email_events add column if not exists browser_language text;
alter table public.email_events add column if not exists detected_content_language text;
alter table public.email_events add column if not exists email_language text;

alter table public.page_events add column if not exists selected_language text;
alter table public.page_events add column if not exists browser_language text;
alter table public.page_events add column if not exists detected_content_language text;
alter table public.page_events add column if not exists email_language text;

alter table public.share_events add column if not exists selected_language text;
alter table public.share_events add column if not exists browser_language text;
alter table public.share_events add column if not exists detected_content_language text;
alter table public.share_events add column if not exists email_language text;

alter table public.follow_events add column if not exists selected_language text;
alter table public.follow_events add column if not exists browser_language text;
alter table public.follow_events add column if not exists detected_content_language text;
alter table public.follow_events add column if not exists email_language text;

create index if not exists journeys_email_language_idx on public.journeys (email_language);
create index if not exists viewer_builds_email_language_idx on public.viewer_builds (email_language);
create index if not exists email_events_email_language_idx on public.email_events (email_language);
create index if not exists page_events_email_language_idx on public.page_events (email_language);
