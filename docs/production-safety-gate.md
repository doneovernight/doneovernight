# DONEOVERNIGHT Production Safety Gate

Run the production route safety gate before every production deploy:

```bash
node scripts/check-production-routes.mjs
```

No deploy is approved unless the route safety gate passes.

## Add a new client route

1. Add the route to `config/production-routes.json`.
2. Set `url` to the production URL that must keep working.
3. Set `expectedStatus` to the status after redirects are followed, usually `200`.
4. Set `routeType` to one of:
   - `public`
   - `admin`
   - `booking`
   - `workspace`
   - `api`
5. Set `owner` to the client or DONEOVERNIGHT owner.
6. Set `slug` to the route slug.
7. Add a short `notes` value explaining what the route protects.

## Add expected markers

Use identity markers that prove the route is the right surface, not just a working HTTP response.

Good markers:

- Exact `<title>` text.
- Canonical URLs.
- Unique shell labels such as `Website OS`, `Client entry`, or `Workspace syncing`.
- Booking `source` and `intakeVersion` strings.

Avoid fragile markers:

- Generated IDs.
- Dates.
- Dynamic counts.
- Content that changes often.

## Booking route checks

Booking pages should include both production HTML markers and local source checks:

```json
{
  "routeType": "booking",
  "mustContain": ["source: 'example_source'", "intakeVersion: 'example_v1'"],
  "sourceChecks": [
    {
      "file": "example-book/index.html",
      "mustContain": ["source: 'example_source'", "intakeVersion: 'example_v1'", "fetch('/api/task-submit'"]
    }
  ]
}
```

This prevents two booking entry points from silently splitting into different intake groups.

## Asset and API checks

Admin and client shells should include `assetChecks` for critical images, CSS, and API passthroughs:

```json
{
  "assetChecks": [
    {
      "url": "https://admin.doneovernight.com/assets/doneovernight-wordmark.svg",
      "expectedStatus": 200,
      "contentType": "image/svg+xml",
      "mustContain": ["<svg"],
      "mustNotContain": ["Admin route not available."]
    }
  ]
}
```

Use these checks for:

- Client logos.
- DONEOVERNIGHT powered-by wordmarks.
- Shared footer CSS.
- Auth/intake API passthroughs that must not be swallowed by safe fallbacks.

## Admin safety rules

Admin routes must never fall through to public pages. Add `mustNotContain` markers for any public page title or canonical that would be dangerous if served on the admin host.

Missing admin routes must show the protected fallback:

```text
Admin route not available. This route is protected and cannot fall through to the public website.
```

## Run before deploy

```bash
node scripts/check-production-routes.mjs
```

If a route fails, fix the route or the expected marker before deploying.
