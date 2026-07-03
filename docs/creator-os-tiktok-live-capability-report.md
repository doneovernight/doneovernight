# Creator OS TikTok LIVE Capability Report

Date: 2026-07-03
Creator: Mina Mosya (`mosyaamosya`)

## Current Runtime

Creator OS currently exposes `/api/creator-live-status?slug=mosyaamosya` from a Vercel Serverless Function.

The current production runtime can:

- Read creator settings from Supabase.
- Normalize a trusted JSON live-status provider if `TIKTOK_LIVE_STATUS_API_URL` is configured.
- Fall back to manual admin live state and manual Battle Mode.
- Cache each response for about 45 seconds.

The current production runtime does not run a persistent TikTok Webcast connection. Because of that, it cannot confirm event-stream metadata such as gifts, top gifters, likes, or battle events by itself.

HTML scraping of TikTok live pages is intentionally disabled. TikTok page markup is not a stable API surface, can be blocked by CAPTCHA/verification, and must not be used for Creator OS metadata.

## Capability Matrix

| Metadata | Current API | TikTokLive / TikTok-Live-Connector | Public rendering policy |
| --- | --- | --- | --- |
| Current viewer count | Partially supported | Supported by room user / room user sequence events while connected | Show only when `capabilities.viewerCount === true` |
| Total live likes | Partially supported | Supported by like events, but not every stream reliably emits every like event | Show only when `capabilities.likeCount === true` |
| Live duration | Partially supported | Can be derived from confirmed room start time or worker connection state | Show only when `capabilities.liveDuration === true` |
| Battle active | Partially supported | Supported by link-mic battle events while connected | Show only when confirmed by worker/provider or manual Battle Mode |
| Battle opponent | Partially supported | Usually available from link-mic/battle payloads, but payload shape can vary | Show only when confirmed by worker/provider or manual admin entry |
| Gifts | Partially supported | Supported by gift events while connected | Do not render from serverless polling |
| Top gifters | Partially supported | Supported by room user rank list / ranking events while connected | Do not render unless a worker/provider marks it confirmed |

## Fully Supported Today

No TikTok event-stream metadata is fully supported by the current Vercel Serverless runtime alone.

Manual creator-controlled fields are fully supported:

- live/offline fallback
- manual Battle Mode
- opponent name
- battle result
- current win streak

## Partially Supported

The API schema already supports these fields:

- `viewerCount`
- `likeCount`
- `liveDuration`
- `roomId`
- `liveTitle`
- `battleActive`
- `battleOpponent`
- `gifts`
- `topGifters`

They are exposed only when a trusted provider or future worker returns the value and sets the corresponding capability flag. If the value is missing, blocked, stale, or unconfirmed, the field stays `null` and the capability stays `false`.

## Unsupported In Current Serverless Runtime

These must not be inferred from 45-second Vercel polling:

- battle active
- battle opponent
- battle result
- gifts during battle
- top gifters
- rankings
- win streak

Win streak is not a reliable TikTok Webcast primitive. Creator OS should keep it manual unless a future product rule defines how to derive it from confirmed battle results.

## Recommended Long-Term Architecture

Build a separate Creator OS Live Runtime worker:

- Persistent Node or Python process outside Vercel Serverless Functions.
- Uses TikTok-Live-Connector or TikTokLive to connect to TikTok Webcast only while the creator is live.
- Subscribes to room user, like, gift, rank, link-mic battle, armies, punish-finish, and stream-end events.
- Normalizes confirmed event-stream state into Supabase.
- Marks every field with a confidence/capability flag.
- Public Creator OS pages read only the normalized runtime snapshot.
- Manual Battle Control remains available as a creator override and fallback.

Primary references:

- TikTok-Live-Connector README: https://github.com/zerodytrash/TikTok-Live-Connector
- TikTokLive README: https://github.com/isaackogan/TikTokLive
