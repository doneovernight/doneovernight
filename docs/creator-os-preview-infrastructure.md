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
4. Confirm tables exist:
   - `public.creators`
   - `public.creator_auth`
   - `public.analytics_events`
   - `public.creator_connections`
   - `public.creator_live_runtime`
   - `public.creator_poll_votes`
   - `public.creator_newsletter_signups`
5. Confirm seed creator exists:
   - `slug = preview-creator`
   - `username = preview-creator`
   - `display_name = Preview Creator`
6. Confirm storage bucket:
   - bucket: `creator-media`
   - public read enabled
   - service-role writes through API/admin only
   - objects stored under slug folders, for example `creator-media/preview-creator/profile-...jpg`
7. Set branch-scoped Vercel Preview env vars for `feature/multi-creator-foundation`.
8. Redeploy the branch preview.

## Required Vercel Preview Env Vars

Set these for Preview only, ideally branch-scoped to `feature/multi-creator-foundation`:

```txt
CREATOR_OS_ENV=preview
CREATOR_OS_DATABASE_ENV=preview
SUPABASE_URL=<preview-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<preview-supabase-service-role-key>
CREATOR_MEDIA_BUCKET=creator-media
```

CLI shape:

```sh
vercel env add CREATOR_OS_ENV preview feature/multi-creator-foundation
vercel env add CREATOR_OS_DATABASE_ENV preview feature/multi-creator-foundation
vercel env add SUPABASE_URL preview feature/multi-creator-foundation
vercel env add SUPABASE_SERVICE_ROLE_KEY preview feature/multi-creator-foundation
vercel env add CREATOR_MEDIA_BUCKET preview feature/multi-creator-foundation
```

Optional Preview watchtower/ops vars:

```txt
DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL=<preview-ops-webhook>
DONEOVERNIGHT_OPS_BOT_TOKEN=<preview-bot-token>
DONEOVERNIGHT_OPS_CHAT_ID=<preview-chat-id>
HEARTBEAT_TELEGRAM_CHAT_ID=<preview-chat-id>
TELEGRAM_BOT_TOKEN=<preview-bot-token>
```

No production Supabase values should be copied into Preview.

## Write Safety

Creator OS now classifies runtime as `production`, `preview`, or `local`.

In Preview, writes are allowed only when:

- `CREATOR_OS_ENV=preview`
- `CREATOR_OS_DATABASE_ENV=preview`
- `SUPABASE_URL` is present
- `SUPABASE_SERVICE_ROLE_KEY` is present

If Preview Supabase is missing or not explicitly marked as Preview, Creator OS blocks Supabase access with:

```txt
Preview Supabase is not configured.
```

This prevents a Preview deployment from silently writing to Mina production data.

## Verification Checklist After Manual Setup

- `/preview-creator` returns 200.
- `/admin/preview-creator` returns 200.
- `/api/creator-settings?slug=preview-creator` returns `source: database`.
- `/api/creator-health?slug=preview-creator` reports Preview configured.
- Unknown slug returns 404.
- Media upload writes only to Preview `creator-media/<slug>/...`.
- Settings save writes only to Preview `public.creators`.
- TikTok mode has zero `video`, `source`, `.mp4`, `.mov`, or `.webm` references.

Test-only preview creator password:

```txt
previewpreview
```
