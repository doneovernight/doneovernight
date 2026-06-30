# DONEOVERNIGHT Founder Pass Apple Wallet setup

This document is internal setup guidance for signing the DONEOVERNIGHT Founder Pass.

The production endpoint is:

`POST https://doneovernight.com/api/builder-wallet/apple?type=founder`

When all Apple Wallet credentials are present, the endpoint returns a signed `.pkpass` with:

- Founder ID: `DON-000001`
- Founder: `Donovan van der Poel`
- Role: `Founder & Operator`
- QR: `https://doneovernight.com/don`

## Required Apple Developer credentials

Create these in the Apple Developer account:

- Team ID
- Pass Type ID for the Founder Pass
- Pass certificate for that Pass Type ID
- Private key for the pass certificate
- Apple WWDR certificate

## Required Vercel environment variables

Add these to the production Vercel project:

- `APPLE_WALLET_TEAM_IDENTIFIER`
- `APPLE_WALLET_PASS_TYPE_IDENTIFIER_FOUNDER`
- `APPLE_WALLET_CERTIFICATE`
- `APPLE_WALLET_PRIVATE_KEY`
- `APPLE_WALLET_WWDR_CERTIFICATE`

Optional:

- `APPLE_WALLET_PRIVATE_KEY_PASSWORD`

Certificate values may be PEM strings with newlines, escaped-newline PEM strings, or base64-encoded PEM strings.

## Verification after env vars are added

1. Redeploy production so the env vars are available to the serverless function.
2. Open authenticated HQ and check Identity -> Apple Signing.
3. Confirm it shows `Configured`.
4. Click `Download Founder Pass`.
5. Confirm the response is `application/vnd.apple.pkpass`.
6. Add the pass to Apple Wallet on iPhone.
7. Scan the QR and confirm it opens `https://doneovernight.com/don`.

If credentials are missing, the endpoint must keep returning `wallet_certificates_required` and must not generate a fake pass.
