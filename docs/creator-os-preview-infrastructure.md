# Creator OS Preview Infrastructure

This branch adds a safe Preview/Staging path for Creator OS work. It does not add a new creator and does not require production deployment.

## Current Environment Audit

- Production uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Vercel Production-only variables.
- Preview currently has no Supabase URL/key scoped to `feature/multi-creator-foundation`.
- Existing shared Preview+Production Vercel vars include TikTok client key/secret, Turnstile, analytics, Telegram/ops webhooks, and operator webhooks.
- Existing Production-only vars include Supabase, TikTok redirect URI, HQ access token, task submit webhook, and admin client action email webhook.
- Creator OS storage bucket expected by code: `creator-media`.
- Creator OS APIs requiring Supabase:
  - `/api/creator-settings`
  - `/api/creator-live-status`
  - `/api/creator-health`
  - Creator admin login/password changes
  - Creator settings save
  - Creator media upload
  - Creator runtime state/actions
  - Creator analytics, poll votes, newsletter signups
  - TikTok connection registry
  - Watchtower event logging
- Current Preview health behavior without Preview Supabase:
  - Public/admin shell routes can return 200.
  - Unknown slugs return 404.
  - Creator health reports `preview_configured: false`, `labels.database: missing`, `labels.storage: missing`, and blocked write safety.
  - Writes are blocked with `Preview Supabase is not configured.`

## Preview Supabase Setup Plan

1. Create a separate Supabase project for Creator OS Preview.
2. Open the SQL editor in the Preview project.
3. Run [`supabase/preview_setup.sql`](../supabase/preview_setup.sql).
4. Re-run the same SQL once. It is expected to be idempotent and must not raise duplicate key errors.
5. Confirm tables exist:
   - `public.creators`
   - `public.creator_auth`
   - `public.analytics_events`
   - `public.creator_connections`
   - `public.creator_live_runtime`
   - `public.creator_poll_votes`
   - `public.creator_newsletter_signups`
6. Confirm seed creator exists:
   - `slug = preview-creator`
   - `username = preview-creator`
   - `display_name = Preview Creator`
7. Confirm storage bucket:
   - bucket: `creator-media`
   - public read enabled
   - service-role writes through API/admin only
   - objects stored under slug folders, for example `creator-media/preview-creator/profile-...jpg`
8. Set branch-scoped Vercel Preview env vars for `feature/multi-creator-foundation`.
9. Redeploy the branch preview.

## Required Vercel Preview Env Vars

Set these for Preview only, ideally branch-scoped to `feature/multi-creator-foundation`:

```txt
CREATOR_OS_ENV=preview
CREATOR_OS_DATABASE_ENV=preview
SUPABASE_URL=<preview-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<preview-supabase-service-role-key>
CREATOR_MEDIA_BUCKET=creator-media
```

Recommended extra lock:

```txt
CREATOR_OS_PREVIEW_SUPABASE_PROJECT_REF=<preview-project-ref-from-supabase-url>
```

CLI shape:

```sh
vercel env add CREATOR_OS_ENV preview feature/multi-creator-foundation
vercel env add CREATOR_OS_DATABASE_ENV preview feature/multi-creator-foundation
vercel env add SUPABASE_URL preview feature/multi-creator-foundation
vercel env add SUPABASE_SERVICE_ROLE_KEY preview feature/multi-creator-foundation
vercel env add CREATOR_MEDIA_BUCKET preview feature/multi-creator-foundation
vercel env add CREATOR_OS_PREVIEW_SUPABASE_PROJECT_REF preview feature/multi-creator-foundation
```

Optional Preview watchtower/ops vars:

```txt
DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL=<preview-ops-webhook>
DONEOVERNIGHT_OPS_BOT_TOKEN=<preview-bot-token>
DONEOVERNIGHT_OPS_CHAT_ID=<preview-chat-id>
HEARTBEAT_TELEGRAM_CHAT_ID=<preview-chat-id>
TELEGRAM_BOT_TOKEN=<preview-bot-token>
```

No production Supabase values should be copied into Preview. The value derived from `SUPABASE_URL` will be reported by health as `supabase_project_ref`; use that to confirm the preview deployment is pointed at the Preview project.

When `CREATOR_OS_PREVIEW_SUPABASE_PROJECT_REF` is set, Creator OS blocks Preview writes unless it matches the project ref safely derived from `SUPABASE_URL`.

## Write Safety

Creator OS now classifies runtime as `production`, `preview`, or `local`.

In Preview, writes are allowed only when:

- `CREATOR_OS_ENV=preview`
- `CREATOR_OS_DATABASE_ENV=preview`
- `SUPABASE_URL` is present
- `SUPABASE_SERVICE_ROLE_KEY` is present
- `CREATOR_MEDIA_BUCKET=creator-media`

If Preview Supabase is missing or not explicitly marked as Preview, Creator OS blocks Supabase access with:

```txt
Preview Supabase is not configured.
```

This prevents a Preview deployment from silently writing to Mina production data.

## Verification Checklist After Manual Setup

- `/preview-creator` returns 200.
- `/admin/preview-creator` returns 200.
- `/api/creator-settings?slug=preview-creator` returns `source: database`.
- `/api/creator-health?slug=preview-creator` reports:
  - `environment: preview`
  - `database_environment: preview`
  - `storage_environment: preview`
  - `preview_configured: true`
  - `write_safety.status: safe`
  - `supabase_project_ref` matching the Preview Supabase project ref
  - `bucket: creator-media`
- Unknown slug returns 404.
- Media upload writes only to Preview `creator-media/<slug>/...`.
- Settings save writes only to Preview `public.creators`.
- TikTok mode has zero `video`, `source`, `.mp4`, `.mov`, or `.webm` references.

Suggested checks after the branch preview redeploys:

```sh
curl -i 'https://<preview-url>/api/creator-settings?slug=preview-creator'
curl -i 'https://<preview-url>/api/creator-health?slug=preview-creator'
curl -i 'https://<preview-url>/preview-creator'
curl -i 'https://<preview-url>/admin/preview-creator'
curl -i 'https://<preview-url>/unknown'
curl -i 'https://<preview-url>/api/creator-settings?slug=unknown'
```

For write checks, use the Preview admin for `preview-creator` only. Change a harmless field, save, and confirm the row changed in the Preview Supabase `public.creators` table. Upload a tiny placeholder profile image and confirm the object appears only under Preview Supabase Storage, `creator-media/preview-creator/...`.

## Rollback And Safety Notes

- If health shows `database_environment: production` on a Preview deployment, remove the Preview env vars immediately and do not run write tests.
- If health shows `preview_configured: false`, writes should be blocked and the preview is not ready for creator work.
- If the wrong Supabase project ref appears in health, remove the branch-scoped `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Vercel Preview.
- Do not set `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` broadly for all Preview branches until this branch is validated.
- Do not use Mina credentials or Mina content for Preview smoke tests.

Test-only preview creator password:

```txt
previewpreview
```
