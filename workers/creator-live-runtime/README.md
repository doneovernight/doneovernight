# Creator OS Live Runtime Worker

Persistent worker for confirmed TikTok LIVE state. It keeps a TikTok WebCast connection open, normalizes confirmed event data, and writes the current snapshot to Supabase `creator_live_runtime`.

This worker is designed for a persistent host such as Hetzner. Do not run it on Vercel Serverless.

## Required Runtime Env

Copy `.env.example` to `.env` on the server:

```bash
CREATOR_SLUG=mosyaamosya
CREATOR_LIVE_USERNAME=mosyaamosya
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```bash
CREATOR_ID=11111111-1111-4111-8111-111111111111
RUNTIME_STALE_SECONDS=75
RUNTIME_HEARTBEAT_SECONDS=25
RUNTIME_RECONNECT_MIN_MS=10000
RUNTIME_RECONNECT_MAX_MS=300000
TIKTOK_SESSION_COOKIE=
TIKTOK_SIGN_API_KEY=
TIKTOK_ALLOW_PUBLIC_SIGNING=false
TIKTOK_AUTHENTICATE_WS_WITH_SIGN_SERVER=false
TIKTOK_SIGN_SERVER_TRUSTED_HOST=
```

## TikTok Authentication And Signing

Creator OS should not depend on the shared public TikTok signing service in production. Shared public signing can hit `rate_limit_account_day` and leaves the live runtime unavailable.

The `tiktok-live-connector` runtime supports creator-owned TikTok session cookies, but a TikTok session cookie is not enough by itself to open the LIVE WebSocket. The connector still needs a signed WebSocket URL. Upstream documents that `session.cookie` seeds the cookie jar with `sessionid` and `tt-target-idc`, and that `authenticateWs` forwards those credentials to the sign server. Upstream also documents that WebSocket URL signing is delegated to Euler Stream unless a custom signing route is configured.

Production rule:

- Use `TIKTOK_SESSION_COOKIE` for creator-owned TikTok authentication.
- Use a dedicated/private signing provider or dedicated `TIKTOK_SIGN_API_KEY` for WebSocket signing.
- Keep `TIKTOK_ALLOW_PUBLIC_SIGNING=false` in production.
- Do not enable `TIKTOK_AUTHENTICATE_WS_WITH_SIGN_SERVER` unless the signer is private/trusted and `TIKTOK_SIGN_SERVER_TRUSTED_HOST` is set.

### Required Cookie Names

Set `TIKTOK_SESSION_COOKIE` to a cookie header containing:

- `sessionid`, `sessionid_ss`, `sid_tt`, or `sid_guard`
- `tt-target-idc`

Example:

```bash
TIKTOK_SESSION_COOKIE='sessionid=YOUR_SESSION_ID; tt-target-idc=useast2a'
```

### Creator TikTok Linking Flow

1. The creator logs into TikTok in a dedicated browser profile.
2. Open `https://www.tiktok.com/`.
3. Open browser DevTools -> Application -> Cookies -> `https://www.tiktok.com`.
4. Copy `sessionid` and `tt-target-idc`, or copy a cookie header containing those values.
5. On Hetzner, write the cookie only to:

```bash
/opt/doneovernight/app/workers/creator-live-runtime/.env
```

6. Restart the worker:

```bash
pm2 restart creator-live-runtime-mosyaamosya --update-env
```

### Refresh Strategy

TikTok can rotate or revoke sessions after logout, password changes, security checks, or normal expiry. If that happens, replace `TIKTOK_SESSION_COOKIE` with a fresh creator session and restart PM2. The worker logs only whether the cookie is present/valid; it never prints the cookie value.

### Security

Treat `TIKTOK_SESSION_COOKIE` like a password:

- Never expose it to the browser.
- Never store it in Vercel public/client env.
- Never commit it.
- Never forward it to a shared public signing provider.
- Only forward it to a private/trusted signing host controlled by DONEOVERNIGHT or a dedicated production provider.

## 1. Apply Supabase SQL First

Open Supabase Dashboard -> SQL Editor and run:

```sql
create table if not exists public.creator_live_runtime (
  creator_slug text primary key,
  creator_id uuid,
  platform text not null default 'tiktok',
  username text not null,
  is_live boolean not null default false,
  confirmed boolean not null default false,
  confidence text not null default 'unknown',
  source text not null default 'runtime',
  viewer_count integer,
  like_count bigint,
  live_duration text,
  live_started_at timestamptz,
  room_id text,
  live_title text,
  battle_active boolean not null default false,
  battle_opponent text,
  battle_result text,
  battle_win_streak integer,
  battle_updated_at timestamptz,
  gifts jsonb not null default '[]'::jsonb,
  top_gifters jsonb not null default '[]'::jsonb,
  rankings jsonb not null default '[]'::jsonb,
  live_url text,
  checked_at timestamptz not null default now(),
  last_event_at timestamptz,
  stale boolean not null default false,
  stale_after timestamptz not null default (now() + interval '75 seconds'),
  error text,
  capabilities jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists creator_live_runtime_updated_at_idx
  on public.creator_live_runtime (updated_at desc);

alter table public.creator_live_runtime enable row level security;

grant select, insert, update, delete on public.creator_live_runtime to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'creator_live_runtime'
      and policyname = 'Service role manages creator live runtime'
  ) then
    create policy "Service role manages creator live runtime"
      on public.creator_live_runtime
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
```

Verify the table:

```sql
select creator_slug, username, source, confidence, checked_at
from public.creator_live_runtime
order by updated_at desc
limit 5;
```

## 2. Hetzner SSH Deployment

SSH into the server:

```bash
ssh root@YOUR_HETZNER_SERVER_IP
```

Install Node.js 22, Git, and PM2:

```bash
apt update
apt install -y ca-certificates curl gnupg git
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt update
apt install -y nodejs
npm install -g pm2
```

Clone the production repo:

```bash
mkdir -p /opt/doneovernight
cd /opt/doneovernight
git clone https://github.com/doneovernight/doneovernight.git app
cd app/workers/creator-live-runtime
```

Create the worker env file:

```bash
cp .env.example .env
nano .env
```

Fill in:

```bash
CREATOR_SLUG=mosyaamosya
CREATOR_LIVE_USERNAME=mosyaamosya
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Install dependencies and create log directory:

```bash
npm ci --omit=dev
mkdir -p logs
```

Start with PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

Run the command printed by `pm2 startup systemd`. Then save again:

```bash
pm2 save
```

## 3. Verify Runtime Source

Check the process:

```bash
pm2 status creator-live-runtime-mosyaamosya
pm2 logs creator-live-runtime-mosyaamosya --lines 100
```

Check the public API:

```bash
curl -sS 'https://doneovernight.com/api/creator-live-status?slug=mosyaamosya'
```

Expected once the worker has connected/written:

```json
{
  "source": "runtime",
  "confidence": "confirmed"
}
```

Quick healthcheck command:

```bash
curl -fsS 'https://doneovernight.com/api/creator-live-status?slug=mosyaamosya' | node -e "let body='';process.stdin.on('data',c=>body+=c).on('end',()=>{const data=JSON.parse(body); if(data.source !== 'runtime') { console.error(body); process.exit(1); } console.log('Creator live runtime healthy:', data.source, data.confidence, data.checkedAt);})"
```

If Mina is live, public UI should show `LIVE NOW` from `source: "runtime"`. If she is offline, the API can still return `source: "runtime"` with confirmed offline state.

## 4. Restart Worker

```bash
pm2 restart creator-live-runtime-mosyaamosya
```

Hard reset if needed:

```bash
pm2 delete creator-live-runtime-mosyaamosya
pm2 start ecosystem.config.cjs
pm2 save
```

## 5. View Logs

PM2 logs:

```bash
pm2 logs creator-live-runtime-mosyaamosya --lines 200
```

Log files:

```bash
tail -f logs/runtime.out.log
tail -f logs/runtime.error.log
```

System startup logs:

```bash
journalctl -u pm2-root -n 200 --no-pager
```

## 6. Update / Redeploy Worker

```bash
ssh root@YOUR_HETZNER_SERVER_IP
cd /opt/doneovernight/app
git pull --ff-only
cd workers/creator-live-runtime
npm ci --omit=dev
mkdir -p logs
pm2 restart creator-live-runtime-mosyaamosya --update-env
pm2 save
```

Verify after redeploy:

```bash
pm2 status creator-live-runtime-mosyaamosya
curl -sS 'https://doneovernight.com/api/creator-live-status?slug=mosyaamosya'
```

## Reliability Policy

The worker writes only confirmed runtime state. A field is public only when its matching `capabilities` flag is true. On disconnect, shutdown, or stale heartbeat, the API treats the snapshot as unknown instead of showing old live metadata.
