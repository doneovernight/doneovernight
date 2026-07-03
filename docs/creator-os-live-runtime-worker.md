# Creator OS Live Runtime Worker

Creator OS must not infer TikTok metadata from Vercel polling or HTML scraping. Confirmed live state now comes from a separate long-running worker at `workers/creator-live-runtime`.

## Production Worker

- Runs as a persistent Node process outside Vercel Serverless Functions.
- Uses `tiktok-live-connector` and TikTok's WebCast push connection.
- Reconnects automatically with exponential backoff.
- Writes confirmed runtime snapshots to Supabase `creator_live_runtime`.
- Marks every field with a capability flag before the public page can render it.
- Marks the snapshot stale on disconnect/shutdown so old live state is not shown as current.

## Runtime State

Recommended fields:

- `creator_slug`
- `is_live`
- `battle_active`
- `battle_opponent`
- `battle_result`
- `viewer_count`
- `like_count`
- `live_duration`
- `room_id`
- `live_title`
- `gifts`
- `top_gifters`
- `rankings`
- `checked_at`
- `last_event_at`
- `stale_after`
- `source`
- `confidence`
- `capabilities`
- `error`

## Manual Fallback

Battle win streak is not exposed as a reliable top-level TikTok WebCast primitive in the libraries inspected. Creator OS keeps manual battle controls as the source of truth for:

- current battle active
- opponent name
- last result
- current win streak
- undo last result

The public page only renders battle values when they are either manually confirmed or emitted by the worker with confirmed confidence/capability flags.
