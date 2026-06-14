# DONEOVERNIGHT Heartbeat

Heartbeat is the daily operating system summary for DONEOVERNIGHT.

Phase 1 is manual-first:

```bash
node heartbeat/run.js
node heartbeat/run.js --send
```

The deployed manual endpoint is protected:

```bash
curl -X POST https://doneovernight.com/api/heartbeat \
  -H "Authorization: Bearer $HEARTBEAT_API_KEY"
```

Use `?dry_run=1` to generate the message without sending Telegram.

Required to send Telegram:

- `TELEGRAM_BOT_TOKEN`
- `HEARTBEAT_TELEGRAM_CHAT_ID` (defaults to `8615489344`)

Required to enable the protected API endpoint:

- `HEARTBEAT_API_KEY`

Optional health source environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HEARTBEAT_SITE_URL`
- `HEARTBEAT_START_URL`
- `HEARTBEAT_TASK_API_URL`
- `HEARTBEAT_REPOSITORY_URL`

Unavailable data sources should stay visible as `Unavailable` instead of failing the heartbeat.
