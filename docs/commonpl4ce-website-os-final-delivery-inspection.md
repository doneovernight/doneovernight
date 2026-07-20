# COMMONPL4CE Website OS Final Delivery Inspection

## Hardening Completion Addendum — 2026-07-20

This document began as the read-only inspection of commit `6bcfdbccf49d76526d850594639fec6de746e6e9`. The implementation matrix is now the canonical current status; the original findings below remain as the audit trail that motivated the hardening release.

Resolved in the hardening release:

- Production migration `063_website_os_final_hardening.sql` is recorded in the approved Supabase project after an isolated dry run. It reconciles the missing message, email, portfolio and acceptance tables, adds auth/rate-limit/audit persistence, scopes COMMONPL4CE task rows to the `cp` workspace and removes broad anonymous/authenticated write privileges.
- Anonymous Website OS table reads and anonymous task updates are rejected in production. No existing COMMONPL4CE task remains without a workspace ID.
- Login attempts are rate-limited, authentication events are audited, state-changing requests enforce the admin origin, and Settings exposes server-side active-session inventory with individual revocation.
- `/cp` and `/cp-book` share published booking availability. Public content now honors section creation/removal/order, hero visibility, core content, footer/contact fields, validated URLs, design tokens, branding, SEO and integration toggles.
- Media upload performs real image decoding, dimension extraction and optimized persistent variants. Usage is derived server-side from draft and published content.
- Invoice PDFs render all accepted line items, Unicode text and multipage notes with embedded Inter fonts.
- COMMONPL4CE analytics uses a database aggregate, public ingestion is rate-limited, newsletter signups deduplicate and persist consent provenance, and test booking conversions remain excluded.
- Admin routes carry CSP, clickjacking protection, HSTS, nosniff, Referrer-Policy and Permissions-Policy. The full test suite now runs during Vercel builds.
- Website OS has phone-first bottom navigation, thumb-zone sticky actions, card-based operational screens, large calendar targets, mobile builder panes, inert bottom sheets/dialogs and no horizontal overflow from 390px through 1440px. Expensive Preview iframes are absent outside the active Preview tab.
- HTML validation passes for Website OS, `/cp` and `/cp-book`; 121 automated repository tests pass.

Still intentionally incomplete:

- Account recovery and two-factor authentication.
- Real outbound message/email delivery and delivery-provider reconciliation.
- Public Portfolio consumption and production Portfolio UI/API activation.
- Customer/invoice cursor pagination above the current bounded operational list.
- Automated alerts for auth abuse, privilege drift and storage orphaning.
- A reusable CI-owned authenticated browser acceptance harness. The release uses controlled production acceptance instead.

The release commit, Vercel deployment ID, alias mapping and production acceptance results are recorded in the final release report.

Inspection date: 2026-07-19  
Inspection mode: read-only production audit  
Scope: COMMONPL4CE Website OS, public `/cp`, public `/cp-book`, relevant APIs, Supabase schema/data, Vercel routing/deployment, tests and release state  
Canonical capability matrix: [commonpl4ce-website-os-implementation-matrix.md](./commonpl4ce-website-os-implementation-matrix.md)

## Executive Verdict

# NOT READY FOR FINAL DELIVERY

The restored Website OS is a real server-backed application, not a static prototype. Host routing is correct, server-side authentication is enforced, drafts are persisted in Supabase, publishing and rollback are atomic, FAQ content is genuinely managed, bookings persist, and customer/invoice/revenue operations have substantive implementations.

Final delivery is nevertheless blocked. Production has a P0 authorization policy allowing any Supabase `authenticated` role to update any `task_requests` row, and effective anonymous/authenticated grants include unnecessary `TRUNCATE` privileges on Website OS tables. The migration ledger does not match the schema or Git, migration 058 is only partially represented in production, three advertised builder controls do not affect the public site, and current tests do not prove authenticated workflows in a real browser/session. Communications and Portfolio remain intentionally unavailable.

No production record was created, modified, deleted, migrated, deployed or cleaned during this inspection. The live-acceptance mutation sequence was not executed because the brief explicitly required a read-only start and prohibited destructive production testing; this is recorded as an evidence gap, not converted into a pass.

## Classification Summary

| Classification | Capabilities |
| --- | ---: |
| Complete | 99 |
| Partial | 32 |
| Placeholder | 9 |
| Broken | 21 |
| Missing | 36 |
| **Total** | **197** |

The feature-level classifications and evidence are in the canonical implementation matrix. “Complete” means the implementation is complete for that capability; it does not override a system-level security or release blocker.

## 1. Production Baseline

### Repository

| Item | Evidence |
| --- | --- |
| Repository | `doneovernight/doneovernight` |
| Audited checkout | `feature/commonpl4ce-content-builder-completion` |
| Audited commit | `6bcfdbccf49d76526d850594639fec6de746e6e9` (`Contain Website OS preview frames`) |
| `origin/main` | `6bcfdbccf49d76526d850594639fec6de746e6e9` |
| Audited worktree | Clean before documentation changes |
| Local primary worktree `main` | `9fb7541fb38266a375e9a45f53ef551232d0aa4f`; diverges from `origin/main` |
| Stale branch risk | `origin/hotfix/creator-os-admin-401-spam` is 25 commits ahead of its old base and 138 commits behind current `origin/main`; its branch-tip diff would remove modern Website OS/auth/persistence files if merged blindly |

The current feature checkout and `origin/main` agree. The separate local `main` checkout does not; it contains one local Doonia commit not on origin and lacks the current origin chain. Several detached `/private/tmp` worktrees are prunable. This is release-operations drift even though the audited worktree itself was clean.

### Vercel

| Item | Evidence |
| --- | --- |
| Project | `doneovernight` |
| Project ID | `prj_dj9WlUTfSq6OgVZDCE5uCTEQ9mV5` |
| Team ID | `team_poT2RkL0qD1tRiGKXsAOcBr3` |
| Production deployment ID | `dpl_DaWEfbq42GZF2DLWxRTVenDcRH4h` |
| Deployment URL | `https://doneovernight-du4ld66d3-doneovernights-projects.vercel.app` |
| State | Ready / Production |
| Created | 2026-07-19 21:45:25 Europe/Amsterdam |
| Aliases | `doneovernight.com`, `admin.doneovernight.com`, `hq.doneovernight.com`, `ask.doneovernight.com`, `start.doneovernight.com`, `client.doneovernight.com`, `portal.doneovernight.com`, `operator.doneovernight.com` and project aliases |

Vercel inspection did not expose an immutable Git SHA for this deployment. The build timestamp, deployed route artifacts and live source correspond to the audited `origin/main` commit, which was committed in the same minute. This is high-confidence correlation, not cryptographic commit provenance. Deployment metadata should record the SHA explicitly in future.

Production environment-variable names include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, task/admin webhook settings, Telegram settings and Turnstile settings. Values remained encrypted and were not printed. No dedicated invoice-email provider variable was found, consistent with invoice delivery being manual-state-only.

### Routing Identity

| Request | Intended target | Live result |
| --- | --- | --- |
| `https://admin.doneovernight.com/cp` | `/admin/website-os/commonpl4ce/index.html` | 200, Website OS login identity; no public CP title/canonical |
| `https://doneovernight.com/cp` | `/cp/index.html` | 200, public COMMONPL4CE archive |
| `https://doneovernight.com/cp-book` | `/cp-book/index.html` | 200, COMMONPL4CE booking interface |
| Unknown admin slug | `/admin/not-found.html` | 200, admin-safe fallback; no public-page fallthrough |

The host-specific admin rewrite is ordered before filesystem/public handling. The eight-route production safety suite passed all identity and negative-marker assertions.

### Supabase

| Item | Evidence |
| --- | --- |
| Production project | `xvctqtcjhcmjlesbfbmj.supabase.co` |
| Workspace ID | `64cb1104-027b-4dc1-9059-68fbc185d12b` |
| Workspace slug/name | `cp` / COMMONPL4CE |
| Workspace domain/status | `doneovernight.com/cp` / active |
| Active users | One active Owner |
| Migration ledger | Remote reports 061 and 062 only |
| Git migration set | 052-062 plus dated platform migrations |

The database contains objects introduced by migrations absent from the ledger. Conversely, production lacks multiple tables defined by migration 058. Therefore Git, migration history and actual schema are not a coherent release baseline.

## 2. Feature Inventory Findings

The detailed 197-capability matrix is authoritative. The following is the delivery-level summary.

| Area | Delivery state | Direct finding |
| --- | --- | --- |
| Authentication | Partial | Server sessions, bcrypt, roles and workspace checks are real; rate limiting, recovery, 2FA, auth audit and session inventory are missing. |
| Routing/shell | Complete with operational risk | Live split is correct, but stale divergent branches/worktrees make future regression plausible. |
| Overview | Partial | Booking and invoice totals are real; current production mutation/reconciliation was not rerun. |
| Bookings | Partial | Core persistence/actions are implemented; generic status updates lack audit/concurrency parity, search/sort are missing, and embedded `/cp` availability UI is broken. |
| Calendar | Partial | Status dots and availability logic exist; full DST/leap/mobile/action-refresh acceptance was not executed. |
| Customers | Partial | Core CRUD/link/duplicate flow is real; no archive/delete lifecycle, pagination, or complete communication history. |
| Invoices/revenue | Partial | Core creation/status/revenue/PDF works; multi-rate VAT, provider delivery/reconciliation and full credit notes are absent; PDF truncates supported data. |
| Messages/replies | Placeholder/Missing | Hidden from production navigation; production tables and delivery workflow are absent. |
| Branded Emails | Placeholder/Missing | Static preview only; no persisted templates/sends or real delivery. |
| Website Builder | Partial/Broken | Server drafts and atomic publish/rollback are real; generic section CRUD/order and several Content fields do not affect live `/cp`. |
| FAQ | Complete within fixed section | Exact live items are persisted and manageable, but general page ordering remains fixed. |
| Media | Partial | Persistent storage architecture exists; no surviving active storage-backed production asset proves it, and file-content validation is weak. |
| Design controls | Missing | Fonts, colors, spacing, width, button styling, tokens, themes and responsive typography remain hardcoded. |
| Portfolio | Placeholder/Missing | Hidden correctly; production schema/API/public consumer are absent. |
| Analytics | Partial/Broken | Strict COMMONPL4CE event scope and privacy are real; no rate limit and capped/misattributed aggregation make scale accuracy unreliable. |
| Newsletter | Partial | Capture and admin visibility work; no duplicate suppression, consent provenance, unsubscribe, export or delivery integration. |
| SEO | Partial/Broken | Base metadata exists; public CP is deliberately/accidentally undiscoverable and lacks social/structured metadata. |
| Tests/release | Partial/Broken | 113 tests and route checks pass; CI runs only a subset and no authenticated production browser acceptance suite exists. |

## 3. Existing Functionality

### Authentication And Authorization

- Website OS uses `website_os_workspaces`, `website_os_users` and `website_os_sessions`.
- Passwords are bcrypt-hashed at cost 12. Session tokens are random 32-byte values; only SHA-256 hashes are stored.
- Cookie flags are Secure, HttpOnly, SameSite=Strict and Path `/`; session lifetime is 14 days.
- Login, session introspection, logout, password change and logout-other-devices are server actions.
- Role hierarchy exists: Owner, Admin, Editor, Viewer. Content writes require Editor+, rollback and permanent deletion are more restricted.
- Website OS repositories verify authenticated user/workspace relationships server-side.

### Booking, Calendar And Availability

- `/cp` and `/cp-book` submit `source=commonpl4ce_booker`, `intakeVersion=commonpl4ce_booker_v1` to `/api/task-submit`.
- Server-side booking validation reads published availability, rejects offline/past/blocked/reserved dates and uses a deterministic date-based task ID to turn duplicate persistence conflicts into `BOOKING_DATE_UNAVAILABLE`.
- Record actions support archive, mark/unmark test, trash, restore and Owner-only permanent delete with conditional `expected_updated_at` updates and audit events.
- Shared calendar status mapping renders orange pending, green confirmed, red cancelled and grey complete/archive indicators, with multiple dots and accessible labels.
- Test and removed records are excluded from availability and operational totals.

### Customers, Invoices And Revenue

- Customers can be created directly or from bookings, edited independently, deduplicated by normalized email/company and explicitly linked/merged.
- Invoices support booking/customer linkage, line items, invoice-level VAT, integer-cent totals, dates, notes, duplicate protection and six statuses.
- Sent and paid transitions are explicit manual actions with persisted histories and audit events.
- Revenue definition is unambiguous: Invoiced is subtotal excluding VAT for sent/paid/overdue; Paid is subtotal excluding VAT for paid. Draft/cancelled/credited and test-linked invoices are excluded.
- Authorized PDF generation exists, but rendering limits do not match the accepted invoice input limits.

### Content, FAQ And Publishing

- `website_os_content_drafts` is the server source of truth. localStorage is only a recovery cache.
- Autosave uses optimistic revision checks. The API records last editor/time and returns conflicts instead of overwriting.
- Publish and rollback use security-definer PostgreSQL functions with row locks, version creation and state update in one transaction.
- Production currently has version 10, six publish audit events and three rollback audit events. Draft revision 18 matches the published state.
- `/cp` fetches the published config and falls back to static config/HTML if the request fails.
- FAQ has eight persisted live questions in exact current order. The editor supports add, edit, confirmed delete, duplicate, reorder, enabled state, one default-open item or none. Public rendering is accessible.

### Media

- A public `website-os-media` Supabase Storage bucket exists with 4MB and JPEG/PNG/WebP/AVIF constraints.
- Metadata is workspace-scoped, usage-aware and supports upload, select, assignment, replace and soft removal.
- Public assets are intentionally public URLs because they are website media.
- All 35 active production media rows currently point to repository-static paths; no active storage object remains under the `cp/` prefix.

## 4. Gaps And Defects By Severity

### P0 — Production/Security Blockers

#### P0-01: Any Supabase authenticated user can update any `task_requests` row

- **Root cause:** production policy `Allow public update task requests` applies to role `public`, command UPDATE, with both `USING (true)` and `WITH CHECK (true)`. The `authenticated` role also has UPDATE grant.
- **Impact:** an authenticated Supabase user can alter bookings/newsletters/task records without Website OS role or tenant ownership checks. This breaks client isolation and can corrupt availability, status, customer linkage and reporting.
- **Systems:** production Supabase `task_requests`; task/admin APIs that consume it.
- **Recommended fix:** replace the broad policy with ownership/workspace-specific policies, revoke direct client UPDATE where server APIs are the intended boundary, introduce non-null workspace ownership for Website OS bookings, and regression-test forged IDs.
- **Migration required:** yes, reviewed privilege/policy migration plus rollback plan.
- **Risk:** high because policy changes may affect existing non-Website-OS clients; inventory current direct Supabase consumers first.
- **Complexity:** medium.
- **Verification:** anon/authenticated REST probes, two-workspace negative tests, valid owner/admin action tests, public submission regression.

#### P0-02: Effective anonymous/authenticated `TRUNCATE` grants on Website OS tables

- **Root cause:** effective privilege inspection shows `anon` and `authenticated` can `TRUNCATE` every Website OS table, despite migrations intending service-role-only access.
- **Impact:** PostgREST does not normally expose TRUNCATE, but any SQL/RPC path running as those roles could erase tenant data. The privilege is unnecessary and violates least privilege.
- **Systems:** production Website OS tables and role grants.
- **Recommended fix:** explicit `REVOKE ALL`/least-privilege grants for `anon` and `authenticated`; retain service-role access only; audit default privileges.
- **Migration required:** yes.
- **Risk:** low if no direct browser data access is intended; verify before applying.
- **Complexity:** low.
- **Verification:** effective privilege matrix after migration, direct REST/RPC negative probes, repository smoke tests.

### P1 — Required Before Delivery

#### P1-01: Migration history and production schema are inconsistent

- Remote ledger contains only 061/062, while auth/invoice/customer/media objects from earlier migrations exist and seven 058 tables are absent.
- Applying migrations by filename order is unsafe until a schema-baseline/reconciliation migration is prepared.
- Required systems: `supabase/migrations/057_website_os_auth.sql` through `062`, migration runner and production ledger.
- Complexity: medium-high. Risk: high without a dry-run schema diff.

#### P1-02: Migration 058 persistent modules are incomplete in production

Missing: `website_os_message_threads`, `website_os_messages`, `website_os_email_templates`, `website_os_email_sends`, `website_os_portfolio_projects`, `website_os_portfolio_media`, `website_os_acceptance_fixtures`. The `website_os_media_assets` table exists via later schema work.

#### P1-03: Booking tenant ownership is not normalized

`task_requests` uses `source` and JSON workspace conventions, not a non-null Website OS `workspace_id` FK. This weakens cross-workspace authorization and makes policy repair harder. Add an explicit ownership model/backfill and indexes after mapping all consumers.

#### P1-04: Embedded `/cp` availability UI is not connected

`cp-book/index.html` loads published booking availability and unavailable dates. `cp/index.html` does not. Server rejection prevents an actual duplicate, but users can select a visibly available date and only discover the conflict after submission. The public experiences are not functionally identical.

#### P1-05: Builder publishes changes the public renderer ignores

- Generic add/duplicate/delete/order operations change the draft/config but cannot create, remove or reorder fixed public DOM sections.
- Content-tab Hero line, Footer text, Socials and Contact fields are not mapped to the public fields that render.
- Config order puts Booking before FAQ, while public fixed DOM renders FAQ before Booking.
- These controls must either be connected to a schema-driven public renderer or removed/disabled with honest scope labels.

#### P1-06: Unsafe stored URL schemes

Project/social/CTA links can be published into `href` without a strict `https:`, `http:`, `mailto:` and approved-relative-path allowlist. Text is generally escaped/textContent-safe, but stored `javascript:` URL injection remains possible.

#### P1-07: Authentication defenses are incomplete

No login rate limiting/lockout, no recovery flow, no authentication audit, no per-device session inventory, no explicit Origin/CSRF validation, and 13 current sessions exist for one Owner. Add rate limits first, then recovery/session management and auth event logging.

#### P1-08: Admin security headers are incomplete

HSTS is present. CSP/frame-ancestors, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy are absent. The admin page can be framed, creating clickjacking exposure.

#### P1-09: Media validation is based on claimed MIME

Upload validates declared content type and size but not magic bytes, actual image decode, dimensions or decompression behavior. Add server-side signature/decode verification and safe image processing before treating uploads as production-safe.

#### P1-10: Invoice PDF loses valid invoice data

The API accepts up to 25 line items, but the PDF prints at most 14. Non-ASCII characters are replaced and notes are truncated. A legally/customer-facing invoice must represent all persisted values accurately. Multiple VAT rates are also unsupported.

#### P1-11: Analytics can be spammed and undercounts at scale

Public events have no rate limit. Summary queries cap events/bookings/newsletters without pagination, and test-event subtraction is not tied to a booking event. Metrics cease to be reliable at larger volumes.

#### P1-12: Communications and Portfolio are not production modules

They are hidden correctly, but tables/APIs/provider/public consumer are missing. They must remain unavailable until migration, repositories and end-to-end tests exist.

#### P1-13: Release validation can pass while Website OS is broken

`npm test` passed 113 tests, but Website OS tests are largely source/regex/unit/mocked. `vercel-build` runs only `test:how-it-works-industries`, not the full suite. Route safety validates identity/status, not login, data persistence, authorization, publish, media or cleanup.

#### P1-14: No controlled acceptance-fixture channel

The production fixture table is absent. Therefore current records cannot be proved disposable, and this audit could not safely run the requested mutation sequence or verify cleanup.

#### P1-15: Release branch/worktree drift

Local `main` and `origin/main` diverge, and the stale creator hotfix retains a dangerous old Website OS lineage. Protect `main`, delete/archive superseded branches after backup, and deploy only immutable origin commits through CI.

### Top P2 Improvements

1. Fix the 2px horizontal overflow at 320px on `/cp`; 375/768/1024/1440 were clean.
2. Remove duplicate config defaults/legacy `commonpl4ce_site_config` write path after a controlled migration to one content source.
3. Add pagination/search to customer, invoice, booking and analytics queries.
4. Add storage orphan reconciliation and optimized responsive image generation.
5. Reduce public weight: `assets/common-place` is about 37MB, all hero images are eager, and the no-store config fetch measured about 1.24s.
6. Add Open Graph/Twitter/structured metadata and resolve whether the public client site should remain noindex/robots-disallowed.
7. Clean expired sessions and add explicit retention policies for sessions, audit events, analytics and removed media.
8. Prevent duplicate newsletter records and add consent provenance/unsubscribe before active mailing delivery.
9. Remove duplicate FAQ resize listeners when re-rendering config.
10. Record immutable deployment-to-commit provenance in production metadata.

### Affected File And System Map

| Finding | Exact files / production systems |
| --- | --- |
| P0 task authorization | Production Supabase `public.task_requests` grants/policies; `api/task-submit.js`; `api/admin-tasks.js`; `api/admin-update-task.js` |
| P0 TRUNCATE grants | Production grants/default privileges for every `website_os_*` table; migrations `057_website_os_auth.sql` through `062_website_os_content_conflict_errors.sql` need an explicit corrective successor migration |
| Migration/schema drift | `supabase/migrations/057_website_os_auth.sql`, `058_website_os_persistent_modules.sql`, `059_website_os_invoices.sql`, `060_website_os_customers_invoice_completion.sql`, `061_website_os_content_builder.sql`, `062_website_os_content_conflict_errors.sql`, `scripts/website-os-production-migrate.mjs`, production migration ledger |
| Missing persistent modules | `supabase/migrations/058_website_os_persistent_modules.sql`, `lib/website-os-repository.js`, `admin/website-os/commonpl4ce/index.html`, production Supabase schema |
| Weak booking tenant ownership | Production `task_requests`; `api/task-submit.js`; `api/admin-tasks.js`; `api/admin-update-task.js`; `lib/website-os-repository.js` |
| Embedded availability mismatch | `cp/index.html` compared with `cp-book/index.html` and availability enforcement in `api/task-submit.js` |
| Builder/public contract mismatch | `admin/website-os/commonpl4ce/index.html`; `cp/index.html`; `api/task-submit.js`; `assets/common-place/config/site-content.json`; migration 061 content schema/defaults |
| Unsafe published URLs | Content normalization in `api/task-submit.js`; editor in `admin/website-os/commonpl4ce/index.html`; href consumers in `cp/index.html` |
| Auth hardening gaps | `lib/website-os-auth.js`; auth actions in `api/task-submit.js`; production session/audit schema |
| Missing browser security headers | `vercel.json` and live Vercel response headers |
| Media validation/orphans | Upload/content handlers in `api/task-submit.js`; `admin/website-os/commonpl4ce/index.html`; `website-os-media` storage bucket; `website_os_media_assets` |
| Invoice PDF/VAT/delivery | `lib/website-os-invoice-pdf.js`; `lib/website-os-invoices.js`; `api/admin-update-task.js`; `admin/website-os/commonpl4ce/index.html`; production invoice schema |
| Analytics accuracy/abuse | COMMONPL4CE analytics actions in `api/task-submit.js`; analytics UI in `admin/website-os/commonpl4ce/index.html`; `analytics_events` and `task_requests` |
| Newsletter lifecycle | Newsletter actions in `api/task-submit.js`; `cp/index.html`; `cp-book/index.html`; admin Analytics/Newsletter UI; newsletter `task_requests` records |
| Test/release gaps | `package.json`; `test/**/*.test.js`; `scripts/check-production-routes.mjs`; `config/production-routes.json`; absent production `website_os_acceptance_fixtures` |
| Git/release drift | local primary worktree branch `main`; `origin/main`; stale `origin/hotfix/creator-os-admin-401-spam`; prunable detached temporary worktrees |

## 5. Website Builder One-To-One Audit

| Public section / concern | Admin representation | Fields consumed publicly | Result |
| --- | --- | --- | --- |
| Hero | Hero tab + section | desktop/mobile slots, order, src, alt; partial status | Order/media work; Hero line is dead and independent status is defective. |
| Story / Behind the Film | Story section | kicker, heading, body, images | Connected. |
| What We Create | Section editor | kicker, heading, items/body | Connected to fixed DOM. |
| Selected Client / Novateur | Campaign section | copy, logo, video, gallery, links | Connected; published links need scheme validation. |
| Process | Text/items section | kicker, heading, items | Connected. |
| Who This Is For | Text/items section | kicker, heading, body/items | Connected. |
| Behind Romy | Image section | text, desktop/mobile image, alt | Connected. |
| Availability | Content + section | heading/body/secondary/small copy | Connected. |
| Booking CTA | Dedicated editor | kicker, heading, body, label, URL, enabled | Connected to `/cp-book`. |
| FAQ | Dedicated editor | all persisted FAQ fields | Fully connected within the fixed section. |
| Footer | Generic/content fields | secondary body, wordmark, social URL/label, email | Partial; generic Footer text and Content social/contact fields are not mapped correctly. |
| Navigation | No content editor | static BOOK control | Missing management. |
| Arbitrary sections/order | Builder structure controls | none | Broken: config changes do not alter fixed public DOM. |

**FAQ answer:** FAQ is fully manageable as a fixed content section: every live item is persisted and the full requested question lifecycle works. It is not fully manageable as part of a general page-composition system because page ordering/creation remains fixed by public HTML.

**Design-settings answer:** fonts and global design controls do not exist as production content. Public typography, colors, spacing, button styling, radii, widths and breakpoints are CSS. Changing a Website OS content field does not change those design tokens.

## 6. Database And Migration Inspection

### Production Schema Map

| Table | Purpose / key relationships | Workspace / constraints | Lifecycle / audit | Production rows |
| --- | --- | --- | --- | ---: |
| `website_os_workspaces` | Tenant root | unique slug | active/disabled/archived | 1 |
| `website_os_users` | Workspace credentials/roles | workspace FK; unique workspace/email | active, last login/password change | 1 |
| `website_os_sessions` | Server session hashes | workspace/user FK; unique token hash; expiry index | expiry/last activity; no cleanup job | 15 |
| `website_os_clients` | Customer CRM | workspace FK; normalized identity constraints/indexes | timestamps; current schema has customer fields | 1 |
| `website_os_client_bookings` | Customer-to-task link | workspace/client FK; task identity | linked metadata | 1 |
| `website_os_invoices` | Invoice/payment state | workspace/customer; booking ID; active duplicate index | status/payment/send/history fields | 1 |
| `website_os_audit_events` | Business/content/media audit | workspace/user/entity indexes | append-style rows, not technically immutable | 31 |
| `website_os_content_drafts` | One current workspace draft | unique workspace; revision | editor/time/lifecycle | 1 |
| `website_os_content_versions` | Published history | workspace/version unique | publisher/time/source version | 10 |
| `website_os_content_state` | Current live pointer/config | one workspace state | publisher/time | 1 |
| `website_os_media_assets` | Media metadata/usage/storage | workspace/storage indexes | ready/trashed, timestamps | 37 |

Production has 35 active ready media rows and two trashed rows. All active rows use static repository paths; the storage bucket currently has zero objects under the COMMONPL4CE prefix.

Missing production tables from migration 058:

- `website_os_message_threads`
- `website_os_messages`
- `website_os_email_templates`
- `website_os_email_sends`
- `website_os_portfolio_projects`
- `website_os_portfolio_media`
- `website_os_acceptance_fixtures`

### Integrity Checks

- No orphan client-booking link was found when matching both task primary-key and `task_id` conventions.
- No orphan invoice/customer/booking relation was found under the same dual-ID check.
- No duplicate production customer aggregate was detected.
- No test client, active test booking or invoice linked to a test record was found.
- One non-test customer, customer-booking link and draft invoice exist. Without an acceptance-fixture table their provenance cannot be safely classified as disposable.
- Current content draft equals published config and is not stale.
- Zero storage-backed active assets means deployment persistence of a real upload was not evidenced.
- Audit aggregates include customer/invoice/content/media actions, but no current booking archive/test/trash action entries were found in the queried aggregate.

### RLS, Grants And Functions

- RLS is enabled on existing Website OS tables. Direct policies are intentionally absent because server repositories use the service role.
- Content save/publish/rollback functions are SECURITY DEFINER, use `search_path=public`, verify workspace user/role, lock the draft and are executable only by service role.
- These good function controls do not compensate for the unsafe `task_requests` policy and effective TRUNCATE grants described above.

### Retention And Cascades

- Workspace deletion cascades through users/sessions/content/customer records. This is conventional but highly destructive; no guarded tenant-deletion procedure is present.
- User references on audit/content records are often set null, preserving business records but weakening actor retention after user deletion.
- There is no documented retention/cleanup schedule for sessions, audit events, analytics, trashed media or acceptance data.

## 7. API Contract Inventory

| Endpoint / action | Method | Auth / role | Request and response | Conflict / side effects | Gaps |
| --- | --- | --- | --- | --- | --- |
| `/api/task-submit`, `website_os_auth: login` | POST | Public credential verification; workspace from server config | email/password; returns user/workspace and sets cookie | 401 incorrect password, disabled/workspace errors | No rate limit/auth audit |
| `/api/task-submit`, auth `session/logout/change_password/logout_other_devices` | POST | Session; password/revoke actions authenticated | action-specific JSON; clear success/error | session delete/password hash update | No Origin check/session inventory |
| `/api/task-submit?commonpl4ce_content=1` | GET | Viewer+ | content bundle, media, versions, draft/state metadata | read-only | No pagination for media/history |
| Same, `commonpl4ce_content_save` | POST | Editor+ | expected revision + normalized content | 409 conflict; draft revision/audit | Input limits incomplete for general URLs/text |
| Same, `publish` | POST | Editor+ | revision/content after local-asset validation | atomic new version/state; audit | Public fixed renderer ignores some accepted changes |
| Same, `rollback` | POST | Owner/Admin | revision + source version | atomic rollback version/state; audit | No automated browser rollback test |
| Same, `media_update/media_remove` | POST | Editor+ | allowlisted metadata/usage action | update/soft remove/audit | Reconciliation and actual-image validation gaps |
| `/api/task-submit?commonpl4ce_content_upload=1` | POST multipart | Editor+ | image file/category/variant/alt | storage object + DB metadata; failure cleanup | Trusts claimed MIME; no transform |
| `/api/task-submit?commonpl4ce_site_config=1` | GET | Public | published config + unavailable dates/source | no-store dynamic read, static fallback in clients | Legacy POST/write source remains duplicate |
| `/api/task-submit` booking intake | POST | Public + human/validation controls | COMMONPL4CE booking fields/source/version | 400 validation, 409 unavailable/duplicate; creates task | No public request rate limiter identified |
| `/api/task-submit`, newsletter | POST | Public | validated email + COMMONPL4CE source/version | creates newsletter task | No duplicate/consent/unsubscribe |
| `/api/task-submit`, analytics event | POST | Public scoped allowlist | event/path/non-sensitive metadata | creates analytics event | No rate limit/idempotency |
| `/api/task-submit`, analytics summary | POST | Authenticated workspace | range | aggregate response | Hard caps and test attribution defect |
| `/api/admin-tasks` | POST | Website OS session | workspace dashboard/tasks/customers/invoices | server-normalized read | Source-based task tenant scope; list caps |
| `/api/admin-update-task`, generic update | POST | authenticated role | task/status patch | task update | Status path lacks action-level concurrency/audit parity |
| Same, `commonpl4ce_record_action` | POST | Owner/Admin; Owner for permanent delete | record ID/action/expected timestamp | archive/test/trash/restore/delete + audit | Depends on weak task tenant representation |
| Same, `commonpl4ce_customer_action` | POST | Owner/Admin | create/edit/link/merge payload | customer/link/audit | No customer archive/delete/pagination |
| Same, `commonpl4ce_invoice_action` | POST | Owner/Admin | create/edit/status/PDF payload | invoice/history/audit/PDF base64 | No actual send/payment provider; PDF truncation |

Error shapes are generally explicit, but legacy generic task APIs and specialized Website OS actions do not share one versioned schema. Idempotency is provided for date bookings and optimistic content/action updates, not universally for analytics/newsletter/status operations.

## 8. UI, Accessibility And Browser Inspection

### Browser Evidence

Safari automation was unavailable in the audit environment; this is an unfulfilled requested browser check. Chromium-based automated inspection was completed.

| Surface | Widths checked | Result |
| --- | --- | --- |
| `/cp` | 320, 375, 768, 1024, 1440 | No broken images/console errors. 2px horizontal overflow at 320 only. |
| `/cp-book` | 390 plus desktop inspection | Correct booking identity, one visible booking form, no overflow/broken images/errors. |
| Admin `/cp` login | 320, 1440 | Login-only state, EN/NL controls, accessible fields/button, no overflow/broken images/errors. |

The named long-heading preview issue (`Novateur / Selected Client`) is addressed in current CSS with constrained columns, safe wrapping and minimum-width safeguards; no current overflow was reproduced. Authenticated Builder screens were not opened because no production credential was used in this read-only inspection.

Public FAQ uses buttons, `aria-expanded`, controlled regions and keyboard navigation. Calendar today/status labels are implemented in source. A complete keyboard/focus/touch-target pass across authenticated modules remains unproven.

## 9. Security Inspection

### Positive Controls

- Server-side password hashing and token-hash sessions.
- Secure/HttpOnly/SameSite cookie.
- Server role checks and workspace FKs in dedicated Website OS repositories.
- Content XSS protection primarily uses escaping/textContent.
- Local blob/base64/file media is blocked from publish.
- SECURITY DEFINER content RPC execute privileges are service-role only.
- Secrets were not present in client bundles or printed during inspection.
- Admin host routing does not fall through to public content.

### Outstanding Threats

- P0 broken authorization on `task_requests` and dangerous grants.
- Login brute force and public analytics/newsletter/booking abuse due absent rate limits.
- Clickjacking and missing browser security headers.
- Stored unsafe URL schemes in published links.
- Claimed-MIME upload bypass; no actual image decode.
- No explicit CSRF Origin enforcement for admin mutations.
- Booking source/JSON scoping is susceptible to future IDOR mistakes.
- Audit events are mutable/deletable by service-role code; no immutable external audit sink.
- Invoice PDF output sanitizes by data loss rather than faithful safe rendering.
- Session replay remains possible until expiry if cookie is stolen; no device binding/rotation/reuse detection.

No destructive exploit, privilege escalation or cross-workspace mutation was attempted against production.

## 10. Performance And Reliability

### Live Synthetic Measurements

| Surface | HTTP result | Transfer/body | Browser timing sample |
| --- | --- | ---: | --- |
| `/cp` | 200 | ~94KB HTML | TTFB 24ms, FCP 140ms, LCP 388ms, CLS 0.00 |
| `/cp-book` | 200 | ~50KB HTML | TTFB 40ms, FCP/LCP 88ms, CLS 0.00 |
| Admin `/cp` | 200 | ~402KB HTML | TTFB 63ms, FCP/LCP 576ms, CLS 0.01 |
| Published config API | 200 | ~14KB JSON | ~1.24s total sample, no-store |

The admin lazily mounts Preview iframes and large Media/Preview regions, which materially limits idle memory. Public `/cp` still eagerly loads all seven hero images. `assets/common-place` is about 37MB, including a roughly 4MB video and multiple large images/logos.

Likely scaling limits:

- Customer/invoice list caps of 200 and analytics hard caps without pagination.
- Per-page no-store content API query adds latency and Supabase dependency to every config load.
- No public ingestion rate limiting or queue/backpressure.
- No retry/idempotency model for newsletter/analytics and no email provider failure model.
- Media replacement can leave old storage objects if asynchronous deletion fails.
- No monitoring/alerting for content RPC, Supabase latency, storage cleanup or authorization-policy drift.
- Deployment rollback exists at Vercel level and content rollback exists at version level, but no automated coordinated recovery drill was found.

## 11. Data Integrity And Cleanup

No data was deleted. Read-only checks found:

- no active test booking/client/invoice linkage;
- no orphan customer-booking link under both task-ID conventions;
- no orphan invoice/customer/booking relation;
- no stale content draft (draft equals live);
- no active storage object, so no production object/metadata orphan was detectable;
- 13 unexpired and two expired server sessions;
- one non-test customer/link/draft invoice of unknown fixture provenance;
- two trashed media metadata rows;
- no acceptance-fixture table and therefore no authoritative fixture cleanup ledger.

Safe remediation: first install an acceptance-fixture ledger and read-only reporting, classify the existing non-test records with the owner, then perform cleanup only through authenticated Owner APIs with audit entries and a pre-delete export.

## 12. Test Quality

Commands and results:

- `npm test`: **passed, 113/113**.
- `node scripts/check-production-routes.mjs`: **passed, 8/8 production routes**.
- JavaScript extraction/parse checks for public/admin inline scripts: passed during repository validation.
- Live Chromium page/error/asset/viewport checks: passed except `/cp` 320px overflow.
- Direct read-only production Supabase schema, grants, policy, row-count, linkage and content-state queries: completed.

Meaningful limitations:

- Most Website OS tests inspect source patterns, pure functions or mocked data; they do not log in to production, perform mutations, refresh and verify database state.
- Route checks validate page identity, markers and assets, not authenticated behavior.
- `vercel-build` omits the full test suite.
- Migration tests do not provision a clean database and apply the entire migration chain.
- No current browser test covers forged IDs, cross-workspace access, Owner/Admin/Editor/Viewer differences, content conflicts, file upload or rollback.
- No current test validates all accepted invoice lines in the PDF or multiple VAT rates.
- Tests can therefore pass while production authorization, embedded availability, builder live consumption or schema drift is broken.

## 13. Live Acceptance Status

The requested 20-step mutation workflow was **not executed in this inspection**. Creating and deleting fixtures would contradict the read-only/no-delete constraints and production lacks the acceptance-fixture table required to prove controlled cleanup.

Read-only acceptance passed for:

- route/domain identity;
- login gate presence;
- public page and booking-page rendering;
- published config/source/version retrieval;
- current FAQ/public section presence;
- production schema/linkage/audit/content-state inspection;
- public assets and browser console;
- static fallback code path;
- route safety suite.

Before delivery, a dedicated acceptance workspace or fixture ledger must run the full sequence using two roles and a forged second workspace, then prove cleanup by ID.

## 14. Remediation Plan

| Order | Severity | Remediation | Files/systems | Migration | Risk | Complexity | Required verification |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | P0 | Revoke broad task UPDATE policy and direct client mutation grants | Supabase `task_requests`, API consumers | Yes | High | M | Public submit; valid admin updates; anon/auth/cross-workspace negative probes |
| 2 | P0 | Revoke anon/auth TRUNCATE and audit default privileges | Supabase Website OS tables/roles | Yes | Medium | S | Effective privilege matrix and repository smoke tests |
| 3 | P1 | Reconcile migration ledger/schema and create clean baseline | migrations 057-062, migration runner, Supabase ledger | Yes | High | L | Fresh DB apply, production dry-run diff, idempotent verification |
| 4 | P1 | Add non-null booking workspace ownership/backfill | `task_requests`, booking APIs/repositories | Yes | High | L | Two-workspace/forged-ID tests and booking regressions |
| 5 | P1 | Connect embedded `/cp` availability UI | `cp/index.html` | No | Low | S | Online/offline/blocked/reserved date browser tests on both entry points |
| 6 | P1 | Make Builder contract honest and live-consumed | admin builder, `cp/index.html`, content schema/validation | Possibly | Medium | L | Each control draft/save/publish/rollback and DOM diff |
| 7 | P1 | Sanitize published URLs | API content normalization + public consumers | No | Low | S | Reject `javascript:`/data; allow approved relative/http/mailto |
| 8 | P1 | Add rate limiting, Origin checks and auth events | auth/public API paths, audit schema | Possibly | Medium | M | brute-force, CSRF, abuse and legitimate-flow tests |
| 9 | P1 | Add security headers | `vercel.json` | No | Medium | S | Browser header and iframe-denial tests across hosts |
| 10 | P1 | Validate/decode/process uploads | upload API/storage/repository | No/optional | Medium | M | forged MIME, corrupt file, dimensions, resize and cleanup tests |
| 11 | P1 | Make invoice PDF faithfully render stored invoice | PDF library/tests | No | Medium | M | 25 lines, Unicode, long notes, 0/21/mixed VAT and rounding fixtures |
| 12 | P1 | Repair analytics aggregation and throttle ingestion | analytics API/query/schema | Possibly | Medium | M | attributed test events, pagination and abuse tests |
| 13 | P1 | Keep or complete hidden modules | migration 058, repositories, provider/public consumer | Yes | High | L | module-specific E2E; remain hidden until passed |
| 14 | P1 | Add acceptance fixture runner and mandatory full CI | fixture table, scripts, package/CI | Yes | Low | M | seed/action/refresh/cross-role/cleanup proof |
| 15 | P1 | Normalize release branch/worktree policy | GitHub branch protection/CI/deploy process | No | Medium | S | immutable SHA deployed from protected main only |
| 16 | P2 | Responsive/performance/SEO/newsletter hardening | public CSS/assets/meta/newsletter APIs | Optional | Low-Medium | M | viewport, Lighthouse, crawler, consent/unsubscribe tests |

## 15. Delivery Sign-Off Checklist

### Engineering

- [x] Production routes and source baseline identified.
- [x] Core server persistence and publish architecture inspected.
- [ ] P0 database authorization/grant fixes applied and verified.
- [ ] Migration history reconciled from a clean database.
- [ ] Every visible control has a live-consumed contract or is removed/disabled honestly.
- [ ] Communications/Portfolio stay hidden until complete.
- [ ] Pagination and scaling limits resolved or documented as hard product limits.

### Security

- [ ] `task_requests` ownership policies enforce tenant isolation.
- [ ] Anonymous/authenticated role grants are least privilege.
- [ ] Login and public ingestion rate limits pass abuse tests.
- [ ] Admin CSRF/Origin and clickjacking/header controls are verified.
- [ ] File content verification blocks forged uploads.
- [ ] Cross-workspace/role/forged-ID browser and API tests pass.
- [ ] Authentication and destructive actions have durable audit evidence.

### QA

- [x] Static/unit suite passed 113/113.
- [x] Route identity suite passed 8/8.
- [ ] Full authenticated browser suite passes on Chromium and Safari.
- [ ] Every booking action persists after refresh/new session.
- [ ] Customer/invoice/PDF/revenue workflow passes with rounding/VAT edge cases.
- [ ] Draft/live/publish/FAQ/media/rollback workflow passes on two devices.
- [ ] Acceptance fixture cleanup is proven by IDs and row counts.

### Product

- [ ] Decide whether arbitrary section composition is a real product capability or remove misleading controls.
- [ ] Decide whether `/cp` should be indexable.
- [ ] Approve invoice delivery/payment limitations and VAT scope.
- [ ] Approve newsletter consent/unsubscribe requirements before mailing.
- [ ] Accept hidden module scope or fund their completion.

### Client Acceptance

- [ ] Romy completes login/password/session check.
- [ ] Romy verifies booking/calendar/action workflows with a disposable record.
- [ ] Romy verifies customer/invoice/PDF/revenue flow.
- [ ] Romy edits, saves, publishes and rolls back FAQ/content/media.
- [ ] Romy approves EN/NL wording, mobile behavior and remaining documented limits.

### Production Operations

- [x] Current aliases map to one Ready production deployment.
- [ ] Deployment records immutable Git SHA.
- [ ] Protected `main` is synchronized; stale hotfix/worktrees are retired safely.
- [ ] Full tests and route/browser acceptance are mandatory before alias promotion.
- [ ] Database migration dry-run, backup and rollback procedures are rehearsed.
- [ ] Alerts exist for auth abuse, Supabase errors, publish failures and storage cleanup.

## 16. Evidence Appendix

### Commit And Deployment

- Audited Git SHA / `origin/main`: `6bcfdbccf49d76526d850594639fec6de746e6e9`.
- Production Vercel deployment: `dpl_DaWEfbq42GZF2DLWxRTVenDcRH4h`.
- Production deployment URL: `https://doneovernight-du4ld66d3-doneovernights-projects.vercel.app`.
- Live aliases: `doneovernight.com` and `admin.doneovernight.com` plus the listed platform subdomains.

### Migration Status

- Local migrations: 052 through 062 plus dated platform migrations.
- Remote migration ledger observed: 061 and 062 only.
- Actual schema: auth/customer/invoice/content/media foundation exists; seven migration-058 persistent-module tables are absent.

### Production Content Evidence

- Published content source: `website_os_content_state`.
- Published version ID: `a859082b-efd2-4ba2-9124-232688975a23`.
- Published timestamp: `2026-07-19T19:38:57.174108+00:00`.
- Eleven enabled public config sections, seven desktop Hero slots, seven mobile Hero slots and eight FAQ items.
- Booking state online; published blocked/unavailable date included 2026-07-21 at inspection time.

### Production Data Counts (No Customer Content)

- workspaces 1; users 1; sessions 15 (13 unexpired, 2 expired);
- clients 1; client-booking links 1; invoices 1;
- audit events 31; content drafts 1; content versions 10; content states 1;
- media assets 37 (35 ready, 2 trashed); active storage-backed assets 0;
- bookings by status: archived 1, completed 1, request-received 1;
- newsletter records: archived 4, new 1.

### Test And Runtime Evidence

- `npm test`: 113/113 passed.
- `node scripts/check-production-routes.mjs`: 8/8 passed.
- Live route HTTP identity: `/cp` 200 public archive; `/cp-book` 200 booking; admin `/cp` 200 login-gated Website OS; unknown admin safe fallback.
- Chromium console/page-error checks: no errors on the three principal surfaces.
- Broken-image checks: none on tested routes.
- Viewport checks: 375/768/1024/1440 clean on `/cp`; 320 has 2px horizontal overflow.
- Safari: not available, not passed by assumption.
- Mutation acceptance/fixture cleanup: not run; no data changed or deleted.

## Final Safety Decision

The application is **not safe to deliver as a final professional Website OS** until both P0 database authorization findings are remediated and verified. Even after the P0 fixes, P1 migration reconciliation, builder-contract repairs, embedded availability synchronization, security hardening and authenticated acceptance automation are required before a final delivery claim.
