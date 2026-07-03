# Creator OS Live Runtime Worker

Creator OS must not infer TikTok battle metadata from Vercel polling. The production page can use the serverless live-status endpoint for coarse live/offline state, but confirmed battle metadata needs a separate long-running worker.

## Recommended Worker

- Run a persistent Node or Python process outside Vercel Serverless Functions.
- Connect to TikTok LIVE with a Webcast client only while the creator is live.
- Subscribe to battle and room events such as battle start, battle armies/points, battle punish finish, gifts, room user updates, and ranking updates.
- Normalize events into a small creator runtime record in Supabase.
- Mark every field with confidence before the public page renders it.

## Runtime State

Recommended fields:

- `creator_slug`
- `is_live`
- `battle_active`
- `battle_opponent`
- `battle_result`
- `battle_score_creator`
- `battle_score_opponent`
- `viewer_count`
- `gifts`
- `top_gifters`
- `rankings`
- `last_event_at`
- `source`
- `confidence`

## Manual Fallback

Battle win streak is not a reliably documented TikTok Webcast field. Creator OS should keep the manual battle controls as the source of truth for:

- current battle active
- opponent name
- last result
- current win streak
- undo last result

The public page should only render battle values when they are either manually confirmed or emitted by the future worker with confirmed confidence.
