# DONEOVERNIGHT X Content Agent V1

The agent only handles the official `@doneovernight` X account. It discovers a controlled registry of primary-source feeds, stores source evidence in Supabase, ranks candidates, generates structured original drafts, validates X weighted characters with `twitter-text`, and publishes only through `POST https://api.x.com/2/tweets` after an identity guard confirms `@doneovernight`.

## Operational model

`CONTENT_PUBLISH_MODE=approve` is the safe production default. Discovery creates `queued` drafts; an operator must approve one through `POST /api/x-content-admin` before the publisher can post it. To enable autonomous publishing deliberately, change exactly one environment variable to `CONTENT_PUBLISH_MODE=auto` (or set the secured `content_publish_mode` setting through the admin endpoint). `draft` mode never publishes.

Vercel runs discovery every two hours and publishing checks every 15 minutes. The publisher also enforces the configured Amsterdam window, three-post daily cap, 180-minute interval, one-source/two-stage duplicate checks, source confidence, post quality, and idempotency. A missed quality gate skips the slot.

## Deploy steps

1. Apply [`supabase/migrations/20260715_x_content_agent.sql`](../supabase/migrations/20260715_x_content_agent.sql) using the existing Supabase project. The migration enables RLS and makes these tables service-role only.
2. Add the variable names in [`.env.example`](../.env.example) to Vercel Production. Keep all values server-side; do not add them to the browser.
3. Configure an X Developer Console project/app with OAuth 2.0 user context for an Automated App or bot. Enable OAuth 2.0, register the exact `X_REDIRECT_URI`, and request only `tweet.write`, `tweet.read`, `users.read`, and `offline.access`. Complete the PKCE authorization flow as `@doneovernight`, then add `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, and `X_REFRESH_TOKEN` to Vercel. The agent refreshes a token when needed for the request; if X rotates the refresh token, update `X_REFRESH_TOKEN` in Vercel immediately.
4. Alternatively configure OAuth 1.0a user context with `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_TOKEN_SECRET`.
5. Set a random `CRON_SECRET`. Vercel sends it automatically to cron routes; use it as `Authorization: Bearer …` for manual protected cron calls.
6. Set `OPENAI_API_KEY` plus an already-approved `OPENAI_MODEL`. The implementation intentionally has no invented fallback model.
7. Deploy, then run `node scripts/x-content-cli.js verify-x` with production variables or call the protected admin `verify_identity` action. It must return `doneovernight` before any post is attempted.
8. Run the publisher dry-run (`publish_now` with `dry_run: true`). To make the one harmless API test post, set `X_ALLOW_TEST_POST=true` and use the protected `test_post` action. Disable it afterward.

## Secure review endpoint

`POST /api/x-content-admin` uses the existing DONEOVERNIGHT admin-key verification service. Supply `admin_key` and an action:

```json
{ "action": "list", "admin_key": "…" }
{ "action": "approve", "draft_id": "…", "admin_key": "…" }
{ "action": "reject", "draft_id": "…", "reason": "…", "admin_key": "…" }
{ "action": "publish_now", "dry_run": true, "admin_key": "…" }
{ "action": "set_mode", "mode": "approve", "admin_key": "…" }
```

`GET /api/x-content-heartbeat` returns operational state only—never credentials or prompts. Logs are in `x_agent_runs` and Vercel function logs. Telegram reports draft-ready, rejected, published, authentication-failure, and no-viable-topic events through the existing bot configuration.

## X account facts

The official X docs specify user-context tokens for post creation and identify `POST /2/tweets` as the create endpoint. OAuth 2.0 refresh tokens require `offline.access`; access tokens otherwise have a short lifetime. See [X Manage Posts](https://docs.x.com/x-api/posts/manage-tweets/introduction) and [X OAuth 2.0 PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code).
