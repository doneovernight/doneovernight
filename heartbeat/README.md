# DONEOVERNIGHT Heartbeat

Heartbeat is the daily operating system summary for DONEOVERNIGHT.

Phase 1 is manual-first:

```bash
node heartbeat/run.js
node heartbeat/run.js --send
```

Supported Telegram delivery environment:

- `TELEGRAM_BOT_TOKEN`
- `HEARTBEAT_TELEGRAM_CHAT_ID` (defaults to `8615489344`)
- `HEARTBEAT_TELEGRAM_WEBHOOK_URL`
- `OPERATOR_APPLY_TELEGRAM_WEBHOOK_URL`

Heartbeat prefers the Bot API when `TELEGRAM_BOT_TOKEN` is configured, and otherwise uses the existing DONEOVERNIGHT Telegram webhook infrastructure.

Optional health source environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HEARTBEAT_SITE_URL`
- `HEARTBEAT_START_URL`
- `HEARTBEAT_TASK_API_URL`
- `HEARTBEAT_REPOSITORY_URL`

Unavailable data sources should stay visible as `Unavailable` instead of failing the heartbeat.
