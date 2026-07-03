# Creator OS Live Runtime Worker

Persistent worker for confirmed TikTok LIVE state. It keeps a TikTok WebCast connection open, normalizes confirmed event data, and writes the current snapshot to Supabase `creator_live_runtime`.

## Run

```bash
npm install
npm start
```

Required environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CREATOR_SLUG=mosyaamosya`
- `CREATOR_LIVE_USERNAME=mosyaamosya`

Optional environment:

- `CREATOR_ID`
- `TIKTOK_SIGN_API_KEY`
- `TIKTOK_SESSION_COOKIE`
- `RUNTIME_STALE_SECONDS=75`
- `RUNTIME_HEARTBEAT_SECONDS=25`
- `RUNTIME_RECONNECT_MIN_MS=10000`
- `RUNTIME_RECONNECT_MAX_MS=300000`

## Reliability Policy

The worker writes only confirmed runtime state. A field is public only when its matching `capabilities` flag is true. On disconnect, shutdown, or stale heartbeat, the API treats the snapshot as unknown instead of showing old live metadata.
