# Creator OS Pending Production Release

Status: Pending combined production deploy

Do not run another production deployment until the Vercel daily deployment limit resets.
The next deploy should ship these changes together as one production release.

## Included

- `f37b3a7` Fix Creator OS intro audio save errors
  - Prevents raw `[object Object]` rendering in admin status messages.
  - Shows readable save failures with the real reason.
  - Improves Intro Audio upload success copy:
    - `✓ Audio uploaded`
    - `Preview available`
    - `Ready to save`
  - Improves API/Supabase error formatting for creator-friendly debugging.

- `d11f80e` Fix Mina battle sticker layering
  - Keeps the `25% OFF` sticker attached to the Prepare for Battle card.
  - Preserves the rounded card border/radius.
  - Adds a battle-card-only rounded border overlay.
  - Keeps the sticker floating above the card with `pointer-events: none`.

## Not Currently Found In This Branch

- Edge-to-edge hero fix
  - No matching committed change found in recent history.

- Countdown layout fix
  - No matching committed change found in recent history.

## Release Notes

- Creator Admin now reports Intro Audio upload/save failures with a clear reason instead of a generic failed state.
- Intro Audio upload success now gives creators a clear ready-to-save state.
- Mina's Prepare for Battle sale sticker no longer breaks the card's premium rounded-corner illusion.

## Verification Already Completed Locally

- Intro Audio:
  - Real MP3 upload path verified through the Creator OS handler against production Supabase.
  - Storage returned `200` with `Content-Type: audio/mpeg`.
  - Save/reload persistence verified.
  - Local admin Chromium/WebKit test confirmed no `[object Object]` rendering.

- Sticker:
  - Mobile Chromium screenshot verified.
  - Mobile WebKit/Safari-like screenshot verified.
  - Card radius remained visually intact.

## Deployment Note

The last deploy attempt was blocked by Vercel:

`api-deployments-free-per-day`

Wait for the daily deployment limit to reset, then deploy once as a combined release.
