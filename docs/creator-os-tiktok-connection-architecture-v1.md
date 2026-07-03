# Creator OS TikTok Connection Architecture v1

Date: 2026-07-03

## Summary

Creator OS should treat TikTok as two related but separate capabilities:

1. Account connection: official OAuth/Login Kit can identify the creator and safely store account-level authorization.
2. Live runtime: TikTok LIVE WebCast metadata is not provided by official OAuth and still requires a persistent runtime plus signed WebSocket access.

The v1 implementation therefore adds a generic `creator_connections` model and a TikTok connection UI, while keeping the current Hetzner worker intact. TikTok runtime credentials remain server-side only.

## Official OAuth Capabilities

TikTok Login Kit for Web supports an authorization-code flow and returns an `access_token` for the TikTok user after authorization. TikTok requires HTTPS redirect URIs, state checking for CSRF protection, and server-side handling of client secrets, refresh tokens, access token requests, and refresh before expiry.

Official Display API user fields include:

- `open_id` with `user.info.basic`
- profile image fields with `user.info.basic`
- `display_name` with `user.info.basic`
- `bio_description`, `profile_deep_link`, `is_verified`, and `username` with `user.info.profile`
- follower/following/likes/video counts with `user.info.stats`

OAuth is suitable for:

- verifying the creator account identity
- storing a provider connection
- showing profile/account status in Creator Admin
- preparing future account-aware analytics

OAuth is not sufficient for:

- confirmed TikTok LIVE on/off state
- WebCast room connection
- real-time viewer count
- likes during a live
- room id
- live duration
- battle/gift/ranking event stream metadata

## Runtime Capabilities

`tiktok-live-connector` can connect to TikTok internal WebCast push service and receive events such as comments, gifts, viewers, likes, battles, rankings, and stream end events. Its own documentation notes that it is reverse-engineered and not a production-ready official TikTok API.

Current runtime path:

- Persistent Hetzner worker
- `tiktok-live-connector`
- Writes confirmed snapshots to Supabase `creator_live_runtime`
- Public API reads runtime snapshots and never exposes credentials

Important limitation:

`TIKTOK_SESSION_COOKIE` can authenticate a creator TikTok session, but it does not remove the need for a signed WebSocket URL. The connector documents `session.cookie` and `authenticateWs`, but forwarding a session to a signing server sends creator credentials to that signer. Creator OS must only do this with a private/trusted signing host or dedicated production provider.

## Required Session Values For Beta Runtime

For the internal beta session-cookie path, the cookie header must include:

- one of `sessionid`, `sessionid_ss`, `sid_tt`, or `sid_guard`
- `tt-target-idc`

This is not creator-facing long-term UX. It is an internal bridge until a safer dedicated TikTok runtime provider or private signer is in place.

## Security Model

Rules:

- Public frontend never sees tokens, cookies, encrypted tokens, or session references.
- Admin UI only sees connection status, username, runtime status, last sync, and last error.
- Secrets are written only through server-side Creator Admin API actions.
- Secrets are encrypted before storage using AES-256-GCM.
- Encryption key source is `CREATOR_CONNECTIONS_SECRET`, falling back to the Supabase service role key for current deployment compatibility.
- Logs must never include raw cookies, tokens, or decrypted values.
- The Hetzner worker reads connection config from Supabase when available and falls back to existing env settings if the table is not applied.

## Database Model

`creator_connections`

- `creator_slug`
- `provider`
- `status`
- `username`
- `external_id`
- `access_token_encrypted`
- `session_reference`
- `runtime_enabled`
- `last_sync_at`
- `last_error`
- `metadata jsonb`
- `created_at`
- `updated_at`

The model is provider-generic so Discord, YouTube, Twitch, Kick, Instagram, Spotify, and Apple Music can use the same status surface later.

## Recommended v1 Path

1. Ship TikTok as the first Creator Connection.
2. Use official OAuth later for profile identity and account-level authorization.
3. Keep LIVE detection on the Hetzner runtime, not Vercel polling.
4. Keep the manual TikTok session-cookie path internal/beta only.
5. Keep runtime state separate from connection state:
   - connection state answers “is this platform connected?”
   - runtime state answers “what is happening live right now?”
6. Do not show fake live state if runtime is blocked or credentials are missing.

## Implementation Notes

Implemented in v1:

- `creator_connections` migration
- protected Creator Admin API actions:
  - `load_connections`
  - `connect_tiktok`
  - `reconnect_tiktok`
  - `disconnect_tiktok`
- sanitized admin response with no secrets
- TikTok Connections tab in Mina admin
- encrypted internal beta session-cookie storage
- Hetzner worker reads TikTok connection config from Supabase when available
- current env-based worker fallback remains intact

Not implemented yet:

- full TikTok OAuth authorization callback
- token refresh scheduler
- private signing host
- creator-facing OAuth connect button that completes a real TikTok app review flow
