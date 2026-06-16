-- DONEOVERNIGHT first-party analytics grants
-- Run this in Supabase SQL editor if /api/track-event returns:
-- { stored: false, reason: "supabase_http_403" }
--
-- The public site posts events to a Vercel serverless function.
-- The function writes with SUPABASE_SERVICE_ROLE_KEY, not from the browser.

grant usage on schema public to service_role;
grant select, insert on public.analytics_events to service_role;
grant usage, select on all sequences in schema public to service_role;

