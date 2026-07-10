# DONEOVERNIGHT Phase 1 Rollback Plan

Recorded: 2026-07-10, before DON Assistant implementation

## Immutable production reference

- Production commit: `30ffd31fb2a318d41cb29d0264369c157d5b4a43`
- Production deployment: `dpl_GLXUhZqiY6ceDgZAN49JWjYzCeR7`
- Production deployment URL: `https://doneovernight-pni2rp2ed-doneovernights-projects.vercel.app`
- Production source branch: `hotfix/commonpl4ce-performance-v1`
- Commit message: `Add English and Dutch Website OS interface`

The production commit is newer than and divergent from `main` at the time of inventory. Do not use `main` alone as the rollback source.

## Remote rollback references created

- Backup branch: `backup/production-2026-07-10-pre-don-assistant`
- Annotated tag: `production-2026-07-10-pre-don-assistant`
- Both references point to `30ffd31fb2a318d41cb29d0264369c157d5b4a43` and were pushed to `origin` before implementation.

## Working branch

- `feature/don-assistant-foundation`
- Created from the exact production commit, not from `main`.

## What Phase 1 changes

- adds `components/don-assistant/`;
- adds the protected `/labs/don-assistant` route;
- adds tests, validation, website strategy documents, and prototype outputs;
- adds `/labs` to `robots.txt`;
- adds package scripts for local validation.

It does not change the production homepage, existing route markup, existing forms, APIs, database schema, analytics code, logo assets, footer assets, or Vercel routing.

## Git rollback before deployment

If Phase 1 is rejected before any deployment, delete or abandon the feature branch. Production is unaffected.

To restore a local review checkout to the frozen production tree:

```sh
git fetch origin --tags
git switch backup/production-2026-07-10-pre-don-assistant
git rev-parse HEAD
```

Expected output:

```text
30ffd31fb2a318d41cb29d0264369c157d5b4a43
```

Do not force-push the backup branch or move the annotated tag.

## Vercel rollback after a future approved deployment

Fastest platform rollback:

```sh
vercel rollback dpl_GLXUhZqiY6ceDgZAN49JWjYzCeR7
```

If the CLI requires a URL instead of the deployment ID:

```sh
vercel promote https://doneovernight-pni2rp2ed-doneovernights-projects.vercel.app
```

Then verify every production alias still targets the restored deployment:

- `doneovernight.com`
- `ask.doneovernight.com`
- `admin.doneovernight.com`
- `start.doneovernight.com`
- `client.doneovernight.com`
- `portal.doneovernight.com`
- `operator.doneovernight.com`

Platform rollback must only be executed with explicit Donovan approval.

## Source rollback after a future approved merge

Prefer a revert commit on the integration branch rather than rewriting history:

```sh
git switch <integration-branch>
git pull --ff-only
git revert <phase-1-merge-commit>
git push origin <integration-branch>
```

If production must exactly match the frozen tree, create a restoration branch from the tag and open a reviewed merge:

```sh
git switch -c restore/production-2026-07-10 production-2026-07-10-pre-don-assistant
```

## Post-rollback verification

1. Inspect the active Vercel deployment and confirm the ID/commit.
2. Run the configured production route safety check.
3. Smoke-check homepage, How It Works, Ask, Admin, HQ, Operator, Portal, Client, and critical API health.
4. Confirm homepage logo and footer against the baseline screenshots.
5. Confirm existing forms submit to their original handlers.
6. Confirm `robots.txt` and `sitemap.xml` are the intended frozen versions.
7. Check browser console and runtime logs for new errors.

## Baseline evidence

Route, API, form, analytics, SEO, HQ, and deployment inventories are in `docs/website/current-site-inventory.md`. Baseline screenshots are in `outputs/don-assistant-baseline/`.
