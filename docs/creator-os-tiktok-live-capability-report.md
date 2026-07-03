# Creator OS TikTok LIVE Capability Report

Date: 2026-07-03
Creator: Mina Mosya (`mosyaamosya`)

## Current Runtime

Creator OS exposes `/api/creator-live-status?slug=mosyaamosya` from a Vercel Serverless Function, but the function no longer tries to be the live runtime. Its source order is:

1. Confirmed Supabase snapshot from the persistent Creator OS Live Runtime worker.
2. Trusted provider endpoint if configured.
3. Manual admin fallback, clearly marked unconfirmed.

The production live runtime can:

- Read creator settings from Supabase.
- Read confirmed runtime snapshots from Supabase `creator_live_runtime`.
- Normalize a trusted JSON live-status provider if `TIKTOK_LIVE_STATUS_API_URL` is configured.
- Fall back to manual admin live state and manual Battle Mode.
- Cache each response for about 45 seconds.

The Vercel function does not run a persistent TikTok WebCast connection. The standalone worker at `workers/creator-live-runtime` does.

HTML scraping of TikTok live pages is intentionally disabled. TikTok page markup is not a stable API surface, can be blocked by CAPTCHA/verification, and must not be used for Creator OS metadata.

## Capability Matrix

| Metadata | Runtime support | Evidence | Public rendering policy |
| --- | --- | --- | --- |
| Live/offline room state | Fully supported while worker can connect | TikTok-Live-Connector `connect()` resolves room state and `streamEnd` fires when the host ends the live | Show confirmed live/offline when `confidence === "confirmed"` |
| Room id | Fully supported on successful connection | TikTok-Live-Connector `connect()` returns `state.roomId`; TikTokLive exposes `client.room_id` | Show only when `capabilities.roomId === true` |
| Current viewer count | Fully supported while room user events arrive | TikTok-Live-Connector `roomUser` contains viewer count; TikTokLive `RoomUserSeqEvent` has `total` / `total_user` | Show only when `capabilities.viewerCount === true` |
| Total live likes | Partially supported | TikTok-Live-Connector README says like events are not always triggered by TikTok for streams with many viewers; TikTokLive `LikeEvent` has `total` | Show only after a confirmed like event with `capabilities.likeCount === true` |
| Live duration | Partially supported | Can be derived only when room metadata includes a real start/create timestamp | Show only when `capabilities.liveDuration === true` |
| Battle active | Fully supported while battle events arrive | TikTok-Live-Connector exposes `linkMicBattle`; TikTokLive has `LinkMicBattleEvent` | Show only when `capabilities.battleActive === true` or manual Battle Mode is enabled |
| Battle opponent | Partially supported | Battle payloads contain anchor/user lists, but exact payload shapes vary by region/feature | Show only when a worker/provider or manual admin entry supplies it |
| Battle result | Partially supported | TikTokLive `LinkMicBattleEvent` has `battle_result`, but mapping it authoritatively to Mina after reconnect requires complete battle context | Keep manual unless worker can prove the creator mapping |
| Battle win streak | Unsupported as authoritative runtime field | No stable top-level win-streak field appears in TikTokLive generated events or TikTok-Live-Connector documented event payloads | Manual Creator OS win streak remains source of truth |
| Gifts | Fully supported after worker connection | TikTok-Live-Connector and TikTokLive both expose gift events, including repeat/streak handling | Store/display only from worker with `capabilities.gifts === true` |
| Top gifters | Fully supported when room user rank list arrives | TikTok-Live-Connector `roomUser` documents a top-gifter list; TikTokLive `RoomUserSeqEvent` exposes ranks | Store/display only when `capabilities.topGifters === true` |
| Rankings | Partially supported | TikTokLive exposes `RankUpdateEvent`; TikTok-Live-Connector exposes `rankUpdate` | Store/display only when emitted and capability is true |

## Fully Supported By The Persistent Worker

- confirmed live/offline state
- room id
- viewer count when room-user events arrive
- gifts after connection
- top gifters when room-user rank lists arrive
- battle active when battle events arrive
- stream end

## Partially Supported

- `viewerCount`
- `likeCount`
- `liveDuration`
- `roomId`
- `liveTitle`
- `battleActive`
- `battleOpponent`
- `gifts`
- `topGifters`
- `rankings`

They are exposed only when the worker/provider returns the value and sets the corresponding capability flag. If the value is missing, blocked, stale, or unconfirmed, the field stays `null` and the capability stays `false`.

## Unsupported As Automatic Authoritative Data

- win streak

Win streak is not a reliable TikTok WebCast primitive in the inspected protocol wrappers. TikTok likely computes or stores battle streak state server-side for the app experience, but it is not exposed as a stable documented field through the generated `LinkMicBattle`, `LinkMicArmies`, `RankUpdate`, or room-user events. Creator OS keeps manual win streak as fallback.

## Production Architecture

- Persistent Node worker outside Vercel Serverless Functions.
- Uses TikTok-Live-Connector to connect to TikTok WebCast.
- Subscribes to room user, like, gift, rank, link-mic battle, armies, punish-finish, and stream-end events.
- Normalizes confirmed event-stream state into Supabase `creator_live_runtime`.
- Marks every field with a confidence/capability flag.
- Public Creator OS pages read only the normalized runtime snapshot through the API.
- Manual Battle Control remains available as a creator override and fallback.

Primary references:

- TikTok-Live-Connector README and event docs: https://github.com/zerodytrash/TikTok-Live-Connector
- TikTok-Live-Connector current event constants/types: https://github.com/zerodytrash/TikTok-Live-Connector/blob/ts-rewrite/src/types/events.ts
- TikTokLive README: https://github.com/isaackogan/TikTokLive
- TikTokLive generated proto event wrappers: https://github.com/isaackogan/TikTokLive/blob/master/TikTokLive/events/proto_events.py
