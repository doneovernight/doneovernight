# Website OS Production Migrations

Website OS schema changes are applied through the Supabase CLI, never through browser-only flows, Vercel Functions, or PostgREST service-role requests.

## Required secrets

Use one secured production-only connection method. Never commit these values.

- `SUPABASE_DB_URL`: percent-encoded production Postgres connection URL; or
- `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_ACCESS_TOKEN`.

The service-role key is not a database migration credential and must not be used for DDL.

## Safe workflow

1. Pull the current branch and inspect `supabase/migrations/`.
2. Export production-only credentials in a secure operator shell or CI secret store.
3. Run an isolated dry run for the reviewed migration. The isolated worktree includes the already-applied production ledger baseline (`061` and `062`) but excludes every unrelated, unapplied local migration:

   ```bash
   node scripts/website-os-production-migrate.mjs --only 063_website_os_final_hardening.sql
   ```
4. Review the Supabase CLI dry-run output.
5. Apply only after review:

   ```bash
   WEBSITE_OS_MIGRATIONS_APPROVED=apply-production-website-os \
   node scripts/website-os-production-migrate.mjs \
     --only 063_website_os_final_hardening.sql \
     --apply
   ```

6. Verify remote migration history and table availability before enabling a module API.
7. Create test data only through authenticated server-side endpoints and register it in `website_os_acceptance_fixtures`.

## Guardrails

- Never run `supabase db reset` against production.
- The runner verifies the production project reference (`xvctqtcjhcmjlesbfbmj`) before any dry run or apply.
- Never use migration SQL for client content, real booking data, or passwords.
- Do not expose a Website OS module until its migration, repository, API and browser tests all pass.
- Fixtures must have `is_test = true`, a clear `fixture_key`, expiry and cleanup record.
