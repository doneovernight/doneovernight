# DONEOVERNIGHT task intake data

`/task` submissions now persist through the server-side Vercel function at
`/api/task-submit`.

Current runtime behavior:
- The browser posts JSON only to `/api/task-submit`.
- The Vercel function validates the payload and generates the `DON-YYYY-00001`
  operational task ID.
- The Vercel function inserts the structured task into Supabase using server-side
  environment variables.
- If Supabase insert fails, the API returns an error and does not pretend the
  task was received.
- If `TASK_SUBMIT_WEBHOOK_URL` is configured, the function notifies operations
  after Supabase persistence. Webhook failure is logged only after the database
  insert succeeds.

Required Vercel environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional environment variable:
- `TASK_SUBMIT_WEBHOOK_URL`

SQL setup:
- Review and run `supabase/task_requests_intake.sql` in Supabase before enabling
  production writes.

Future integration path:
- Keep `lib/tasks/model.js` as the stable normalization layer.
- Connect n8n to quote creation, operator queue updates, payment generation, and
  client portal status sync.
- Client portal task submission still uses its existing n8n endpoint for now.
  When it is migrated, send `source: client_portal` into `/api/task-submit`.
