# COMMONPL4CE Website OS Implementation Matrix

Canonical capability status for `admin.doneovernight.com/cp`, updated on 2026-07-20 after the final hardening implementation and production application of migrations `063_website_os_final_hardening.sql`, `064_website_os_today_briefing.sql` and `065_website_os_business_documents.sql`. The release commit and deployment are recorded in the final release report after production verification.

Status meanings:

- **Complete**: implemented across every required layer and supported by direct production or deterministic repository/database evidence.
- **Partial**: useful implementation exists, but an integration, resilience, scale, security, or current end-to-end evidence gap remains.
- **Placeholder**: UI or state exists intentionally without the production operation it represents.
- **Broken**: the intended or previously claimed behavior is contradicted by current evidence.
- **Missing**: no meaningful implementation exists.

Layer columns: **UI** = interface exists; **FE** = frontend wired; **API** = server contract; **DB** = persistent source of truth; **Authz** = server authorization; **Live** = public/live consumer where applicable; **E2E** = directly verified end to end in this inspection; **Ready** = safe to sign off for delivery. `Y`, `P`, `N`, and `-` mean yes, partial, no, and not applicable.

## Authentication And Access

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Workspace login | Complete | Y | Y | Y | Y | Y | - | Y | Y | Live unauthenticated admin route shows only the Website OS login; bcrypt-backed server login and session issuance are implemented. |
| AUTH-02 | Incorrect-password handling | Complete | Y | Y | Y | Y | Y | - | P | Y | Explicit `Incorrect password.` response and UI state; source/unit evidence, no destructive credential probe in this audit. |
| AUTH-03 | Logout | Complete | Y | Y | Y | Y | Y | - | P | Y | Server session deletion and cookie clearing are implemented. |
| AUTH-04 | Session persistence and refresh | Complete | Y | Y | Y | Y | Y | - | P | Y | Secure HttpOnly session cookie and persisted token hashes; 13 unexpired production sessions show persistence. |
| AUTH-05 | Session expiry | Complete | Y | Y | Y | Y | Y | - | P | Y | Fixed 14-day expiry is verified server-side; expired rows are rejected, though not automatically purged. |
| AUTH-06 | Password change | Complete | Y | Y | Y | Y | Y | - | P | Y | Current-password verification, minimum length and server-side bcrypt update; other sessions revoked. |
| AUTH-07 | Logout other devices | Complete | Y | Y | Y | Y | Y | - | P | Y | Current token is retained and other persisted sessions are revoked. |
| AUTH-08 | Owner/Admin/Editor/Viewer role model | Complete | P | Y | Y | Y | Y | - | P | Y | Role hierarchy is enforced in server handlers and repositories; UI exposes only the current single Owner account. |
| AUTH-09 | Workspace scoping in Website OS repositories | Complete | - | - | Y | Y | Y | - | P | Y | Persistent Website OS tables use `workspace_id` and server-side workspace/user checks. |
| AUTH-10 | Booking/newsletter tenant context | Complete | - | Y | Y | Y | Y | Y | Y | Y | COMMONPL4CE task rows carry an explicit `website_os_workspace_id`; migration 063 backfilled every existing row and validated the scope constraint. |
| AUTH-11 | Cross-workspace rejection | Complete | - | - | Y | Y | Y | - | Y | Y | Reads, booking actions, customer/invoice actions and content/media writes verify the authenticated workspace; anonymous table access is rejected. |
| AUTH-12 | CSRF protection | Complete | - | - | Y | - | Y | - | Y | Y | State-changing Website OS requests enforce the approved admin Origin in addition to SameSite=Strict cookies. |
| AUTH-13 | Login rate limiting / lockout | Complete | Y | Y | Y | Y | Y | - | Y | Y | Per-workspace/email/IP failure counters lock repeated attempts for 15 minutes and use constant-cost password verification. |
| AUTH-14 | Two-factor authentication | Missing | N | N | N | N | N | - | N | N | No enrollment or verification path; the inactive placeholder was removed from production Settings. |
| AUTH-15 | Password reset / account recovery | Missing | N | N | N | N | N | - | N | N | No recovery flow or one-time token model. |
| AUTH-16 | Authentication audit log | Complete | - | - | Y | Y | Y | - | Y | Y | Login success/failure/rate-limit, logout, password change and session revocation events are server-recorded with non-reversible fingerprints. |
| AUTH-17 | Session inventory and device metadata | Complete | Y | Y | Y | Y | Y | - | Y | Y | Settings lists active devices and last activity; users can revoke an individual non-current session with workspace/user checks. |
| AUTH-18 | Expired-session cleanup | Partial | N | N | P | Y | Y | - | N | N | Expired sessions are rejected, but two expired rows remain and no retention job was found. |

## Routing, Shell And Navigation

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SHELL-01 | Admin `/cp` host routing | Complete | Y | Y | - | - | Y | Y | Y | Y | Host-specific rewrite precedes filesystem handling and resolves to Website OS. |
| SHELL-02 | Public `/cp` route isolation | Complete | Y | Y | - | - | - | Y | Y | Y | Production route suite and live identity markers confirm the public archive. |
| SHELL-03 | Public `/cp-book` route isolation | Complete | Y | Y | - | - | - | Y | Y | Y | Returns the booking interface with correct source/version markers. |
| SHELL-04 | Unknown admin fallback | Complete | Y | Y | - | - | - | Y | Y | Y | Unknown admin slugs render the admin-safe fallback, not public content. |
| SHELL-05 | Primary navigation destinations / active state | Complete | Y | Y | - | - | Y | - | P | Y | Visible routes are Overview, Bookings, Calendar, Website, Business Documents, Clients, Analytics and Settings. |
| SHELL-06 | Sidebar collapse persistence | Complete | Y | Y | - | P | - | - | P | Y | Preference is stored locally and shell state is restored. |
| SHELL-07 | EN/NL interface locale | Partial | Y | Y | N | P | - | - | Y | N | Immediate switching, `document.lang`, current-screen preservation and refresh persistence were verified in the authenticated production UI; preference remains device-local. |
| SHELL-08 | Mobile shell and keyboard operation | Partial | Y | Y | - | - | - | - | Y | N | Authenticated production screens were exercised at phone width with bottom navigation, sheets, cards and 44px targets; physical Safari/Android coverage remains outstanding. |
| SHELL-09 | Loading/error/success states | Partial | Y | Y | Y | - | - | - | N | N | Major operations have states/toasts, but consistency was not proven across every action. |
| SHELL-10 | Unfinished-module navigation safety | Complete | Y | Y | - | - | - | - | Y | Y | Messages, Branded Emails and Portfolio are hidden; placeholder HTML remains dormant. |

## Overview And Analytics

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DASH-01 | Booking totals and upcoming activity | Complete | Y | Y | Y | Y | Y | - | P | Y | Server summary derives from persisted COMMONPL4CE task records and operational exclusions. |
| DASH-02 | Test/trashed/archived exclusion | Complete | Y | Y | Y | Y | Y | - | P | Y | Shared normalization excludes test and removed records from operational metrics. |
| DASH-03 | Invoiced and paid revenue cards | Complete | Y | Y | Y | Y | Y | - | P | Y | Both use invoice subtotal excluding VAT; draft/cancelled/credited/test-linked invoices are excluded. |
| DASH-04 | Latest activity navigation | Complete | Y | Y | Y | Y | Y | - | P | Y | Cards route to the relevant implemented module. |
| DASH-05 | Analytics event collection scope | Complete | Y | Y | Y | Y | - | Y | P | Y | Client guard and server allowlist restrict COMMONPL4CE events to `/cp` and `/cp-book`; raw emails are excluded. |
| DASH-06 | 24h/7d/30d filters | Complete | Y | Y | Y | Y | Y | - | P | Y | Filters use the production SQL aggregate without client-side row caps; each range was browser-verified, though no synthetic analytics volume test was retained. |
| DASH-07 | Analytics charts / trend visualization | Missing | N | N | N | Y | Y | - | N | N | Only summary metrics/drop-off values exist; no complete charting workflow. |
| DASH-08 | Analytics empty/not-configured state | Complete | Y | Y | Y | - | - | - | P | Y | UI does not fabricate numbers when storage is unavailable. |
| DASH-09 | High-volume analytics accuracy | Complete | Y | Y | Y | Y | Y | - | Y | Y | Migration 063 replaces bounded row reads with a workspace-scoped SQL aggregate for the selected date range. |
| DASH-10 | Test-booking analytics attribution | Complete | Y | Y | Y | Y | Y | - | Y | Y | Conversion aggregation excludes explicitly test-marked bookings in the database-backed summary rather than subtracting unrelated totals. |
| DASH-11 | Analytics abuse resistance | Complete | - | - | Y | Y | - | Y | Y | Y | Public analytics ingestion uses the COMMONPL4CE path/event allowlist and production database rate limiter. |
| DASH-12 | Raw-database reconciliation | Complete | - | - | Y | Y | Y | - | Y | Y | A disposable production booking was created, observed in dashboard/calendar counts, exercised through lifecycle actions and permanently removed; counts returned to baseline. |
| DASH-13 | Today booking briefing | Complete | Y | Y | Y | Y | Y | - | Y | Y | Amsterdam-scoped active bookings open in an accessible desktop dialog/mobile bottom sheet; per-user booking/date dismissal, 60-minute snooze, exact detail navigation, multiple-booking stepping and a persistent Today entry point are covered by migration 064 and browser acceptance. |

## Bookings

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BOOK-01 | `/cp-book` public submission | Complete | Y | Y | Y | Y | - | Y | P | Y | Payload source is `commonpl4ce_booker`, intake version `commonpl4ce_booker_v1`. |
| BOOK-02 | Embedded `/cp` public submission | Complete | Y | Y | Y | Y | - | Y | P | Y | Uses the same endpoint, source, intake version and core fields. |
| BOOK-03 | `/cp-book` published availability UI | Complete | Y | Y | Y | Y | - | Y | Y | Y | Loads published config and unavailable dates, disables blocked dates and renders online/offline state. |
| BOOK-04 | Embedded `/cp` published availability UI | Complete | Y | Y | Y | Y | - | Y | Y | Y | Embedded `/cp` consumes the same published availability and unavailable dates as `/cp-book`; the server remains the final enforcement boundary. |
| BOOK-05 | Server-side availability enforcement | Complete | - | - | Y | Y | - | Y | P | Y | `assertCommonplaceBookingAvailable` rejects offline, past, blocked and already-reserved dates. |
| BOOK-06 | Double-booking protection | Complete | - | - | Y | Y | - | Y | P | Y | Pre-check plus deterministic date task ID and duplicate persistence conflict handling. |
| BOOK-07 | Booking persistence and admin read | Complete | Y | Y | Y | Y | Y | - | P | Y | `task_requests` records are normalized into Website OS. |
| BOOK-08 | Generic status transitions | Partial | Y | Y | Y | Y | Y | - | N | N | Status persists, but generic updates lack optimistic revision and booking-action audit parity. |
| BOOK-09 | Archive | Complete | Y | Y | Y | Y | Y | - | P | Y | Conditional server action preserves record and previous status, with audit entry. |
| BOOK-10 | Mark/unmark as test | Complete | Y | Y | Y | Y | Y | - | P | Y | Dedicated flag persists and excludes availability, totals and revenue. |
| BOOK-11 | Move to Trash / restore | Complete | Y | Y | Y | Y | Y | - | P | Y | Soft-delete metadata, previous status and workspace-scoped restore exist. |
| BOOK-12 | Permanent deletion | Complete | Y | Y | Y | Y | Y | - | P | Y | Explicit Owner-only confirmation and server delete with audit intent. |
| BOOK-13 | Concurrent record actions | Complete | Y | Y | Y | Y | Y | - | P | Y | `expected_updated_at` conditional update prevents stale destructive operations. |
| BOOK-14 | Filters and archived/trash/test views | Complete | Y | Y | Y | Y | Y | - | P | Y | Explicit views preserve removed/test records without polluting active operations. |
| BOOK-15 | Booking search | Missing | N | N | N | Y | Y | - | N | N | No user-facing search workflow. |
| BOOK-16 | User-selectable sorting | Missing | N | N | N | Y | Y | - | N | N | A fixed server/UI order exists; no sort control. |
| BOOK-17 | Notes and booking detail | Complete | Y | Y | Y | Y | Y | - | P | Y | Intake fields and raw references are represented in detail. |
| BOOK-18 | Complete booking history | Partial | Y | Y | Y | Y | Y | - | N | N | Action audit exists for record actions; generic statuses and all edits are not uniformly audited. |
| BOOK-19 | Reply action | Placeholder | Y | Y | N | N | N | - | N | N | Draft UI exists but sending/thread persistence is intentionally unavailable. |
| BOOK-20 | Customer creation from booking | Complete | Y | Y | Y | Y | Y | - | P | Y | Uses normalized duplicate resolution and persisted link table. |
| BOOK-21 | Invoice creation from booking | Complete | Y | Y | Y | Y | Y | - | P | Y | Booking/customer linkage and duplicate guard exist. |
| BOOK-22 | Timezone boundary handling | Partial | Y | Y | Y | Y | - | Y | N | N | Amsterdam-aware server date and local-noon admin parsing reduce drift; DST/browser matrix was not executed. |

## Calendar

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CAL-01 | Month navigation and date selection | Complete | Y | Y | - | Y | Y | - | P | Y | Calendar calculation and selected-day detail are wired. |
| CAL-02 | Today indicator | Complete | Y | Y | - | - | - | - | P | Y | Distinct current/selected classes and `aria-current=date`. |
| CAL-03 | Status color mapping | Complete | Y | Y | - | Y | Y | - | P | Y | Shared mapping: pending orange, confirmed green, cancelled red, completed/archived grey. |
| CAL-04 | Multiple/mixed status dots | Complete | Y | Y | - | Y | Y | - | P | Y | Multiple grouped indicators retain accessible exact-status labels. |
| CAL-05 | Booking detail selection | Complete | Y | Y | Y | Y | Y | - | P | Y | Date detail lists all bookings and supports individual selection. |
| CAL-06 | Test-booking exclusion | Complete | Y | Y | Y | Y | Y | - | P | Y | Test records are excluded from operational dots and availability. |
| CAL-07 | Archived/completed/cancelled behavior | Complete | Y | Y | Y | Y | Y | - | P | Y | Archived/completed are neutral; cancelled is red and no longer reserves date. |
| CAL-08 | Manual blocked dates and publish | Complete | Y | Y | Y | Y | Y | Y | P | Y | Stored in published booking configuration and consumed by `/cp-book`/server. |
| CAL-09 | Availability synchronization across both public bookers | Complete | Y | Y | Y | Y | - | Y | Y | Y | `/cp-book`, embedded `/cp`, and server submission validation read the same published availability/config state. |
| CAL-10 | Leap-year, DST and mobile matrix | Partial | Y | Y | - | Y | - | - | N | N | Deterministic code exists, but requested boundary/browser cases were not directly exercised. |

## Customers

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CUST-01 | Create from booking | Complete | Y | Y | Y | Y | Y | - | P | Y | Prefill and persisted booking/customer link exist. |
| CUST-02 | Standalone creation | Complete | Y | Y | Y | Y | Y | - | P | Y | Owner/Admin server action. |
| CUST-03 | Editing without booking mutation | Complete | Y | Y | Y | Y | Y | - | P | Y | Customer fields update independently. |
| CUST-04 | Email/company normalization and duplicate detection | Complete | Y | Y | Y | Y | Y | - | P | Y | Normalized columns/indexes and explicit conflict response. |
| CUST-05 | Link/merge resolution | Complete | Y | Y | Y | Y | Y | - | P | Y | User explicitly chooses link or merge. |
| CUST-06 | Phone, billing address and VAT fields | Complete | Y | Y | Y | Y | Y | - | P | Y | Persisted structured customer fields. |
| CUST-07 | Linked bookings and invoices | Complete | Y | Y | Y | Y | Y | - | P | Y | Bidirectional detail data is assembled by server repository. |
| CUST-08 | Communication history | Partial | Y | Y | P | Y | Y | - | N | N | Booking/invoice events appear and migration 063 supplies workspace-scoped message/email persistence, but the production communications workflow remains intentionally inactive. |
| CUST-09 | Audit history | Partial | Y | Y | Y | Y | Y | - | N | N | Creation/link/invoice events exist; every customer field edit is not proven immutable/audited. |
| CUST-10 | Workspace authorization | Complete | - | - | Y | Y | Y | - | P | Y | Non-null workspace FK and server role checks. |
| CUST-11 | Archive/delete/restore | Missing | N | N | N | P | N | - | N | N | No customer lifecycle actions beyond editing/linking. |
| CUST-12 | Search and pagination | Missing | N | N | N | Y | Y | - | N | N | List is capped at 200 without user search/pagination. |

## Invoices And Revenue

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INV-01 | Create from booking/customer/standalone | Complete | Y | Y | Y | Y | Y | - | P | Y | All three server paths exist with persisted links. |
| INV-02 | Invoice numbering and workspace uniqueness | Complete | Y | Y | Y | Y | Y | - | P | Y | Workspace-scoped unique constraint for non-cancelled invoices. |
| INV-03 | Customer snapshot/details | Complete | Y | Y | Y | Y | Y | - | P | Y | Invoice preserves customer details independently. |
| INV-04 | Line items, quantity and unit price | Complete | Y | Y | Y | Y | Y | - | P | Y | Up to 25 validated line items and decimal quantities. |
| INV-05 | Single VAT rate and totals | Complete | Y | Y | Y | Y | Y | - | P | Y | Integer-cent arithmetic produces subtotal, VAT and grand total. |
| INV-06 | Multiple VAT rates per invoice | Missing | N | N | N | N | N | - | N | N | One invoice-level VAT rate is applied to all line items. |
| INV-07 | Rounding-sensitive arithmetic | Complete | - | - | Y | Y | Y | - | P | Y | Server calculations use cents and rounded line totals; automated cases pass. |
| INV-08 | Issue/due dates and notes | Complete | Y | Y | Y | Y | Y | - | P | Y | Persisted and editable in draft. |
| INV-09 | Duplicate-invoice protection | Complete | Y | Y | Y | Y | Y | - | P | Y | Active booking invoice conflict with explicit Owner override. |
| INV-10 | Status lifecycle | Complete | Y | Y | Y | Y | Y | - | P | Y | Draft, sent, paid, overdue, cancelled and credited are persisted. |
| INV-11 | Strict allowed transition graph | Partial | Y | Y | Y | Y | Y | - | N | N | Role and status actions exist, but not every invalid transition is represented as an explicit state-machine rule. |
| INV-12 | Send/payment/audit history | Complete | Y | Y | Y | Y | Y | - | P | Y | Manual sent/paid transitions append histories and audit events. |
| INV-13 | PDF generation and accuracy | Complete | Y | Y | Y | Y | Y | - | P | Y | PDFKit renders every accepted line item, Unicode text and multipage notes with embedded Inter fonts; deterministic PDF tests pass. |
| INV-14 | Actual invoice email delivery | Placeholder | Y | Y | N | P | Y | - | N | N | Sent is an explicit manual record; no mail provider delivery. |
| INV-15 | Payment-provider reconciliation | Missing | N | N | N | N | N | - | N | N | Paid is manually asserted; no payment/accounting provider. |
| INV-16 | Revenue definitions and test exclusion | Complete | Y | Y | Y | Y | Y | - | P | Y | Invoiced = sent/paid/overdue subtotal ex VAT; Paid = paid subtotal ex VAT; test-linked excluded. |
| INV-17 | Credit-note document/workflow | Partial | Y | Y | Y | Y | Y | - | N | N | `credited` status exists; no separate credit-note document/number/accounting entry. |
| INV-18 | Invoice search/pagination | Missing | N | N | N | Y | Y | - | N | N | List is capped at 200. |

## Business Identity, Documents And Policies

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BIZ-01 | Central business identity | Complete | Y | Y | Y | Y | Y | - | Y | Y | Legal/contact/brand/invoice defaults are revision-protected, server-backed and workspace-scoped; only known COMMONPL4CE facts are seeded. |
| BIZ-02 | Connected-domain state | Partial | Y | Y | Y | Y | Y | - | P | N | Manual verified/pending/disconnected state is durable; automated DNS ownership and SSL provisioning remain future provider work. |
| BIZ-03 | Business email identity | Partial | Y | Y | Y | Y | Y | - | P | N | Address, reply-to, display name, signature and provider type persist; provider verification and sending are deliberately disconnected. |
| DOC-01 | Document drafts, publish, history and rollback | Complete | Y | Y | Y | Y | Y | - | Y | Y | Revision-protected drafts and transactional immutable versions support publish, archive, duplicate and rollback. |
| DOC-02 | Branded document PDF export | Complete | Y | Y | Y | Y | Y | - | Y | Y | Server-generated PDFs use the persisted business identity and exact saved document/version. |
| DOC-03 | Workflow attachment mapping | Partial | Y | Y | Y | Y | Y | - | P | N | Seven durable destinations exist; invoice consumption is active while branded-email/customer/portal delivery remains future work. |
| DOC-04 | Version-pinned invoice attachments | Complete | Y | Y | Y | Y | Y | - | Y | Y | Invoice creation/update stores exact published document versions and invoice PDF export appends their immutable contents. |
| DOC-05 | Daily-use documents and policy UX | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Presets, focused editing, progressive Advanced controls, compact policy rows, explicit preview/acceptance sheets and one-task mobile navigation preserve the existing version/evidence model. |
| POL-01 | Policy manager | Complete | Y | Y | Y | Y | Y | - | Y | Y | Required/optional, internal/customer-visible, ordering, enablement and acceptance contexts persist per workspace. |
| POL-02 | Public booking acceptance | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Both public bookers read only current customer-visible versions, fail closed on required/stale acceptance and retain the original intake source/version. |
| POL-03 | Immutable acceptance evidence | Complete | Y | Y | Y | Y | Y | - | Y | Y | Exact version, booking, timestamp, customer snapshot and privacy-preserving fingerprints are append-only; later customer linking is role- and workspace-verified. |
| POL-04 | External legal review and approved copy | Missing | N | N | N | N | - | - | N | N | The product deliberately does not invent legal terms; COMMONPL4CE must supply reviewed copy before activating policies. |

## Communications And Portfolio

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| COMM-01 | Reply workspace | Placeholder | Y | P | N | Y | Y | - | N | N | Workspace-scoped thread/message storage now exists, but the dormant composer has no production API or delivery workflow and stays hidden. |
| COMM-02 | Message threads/messages persistence | Partial | P | N | N | Y | Y | - | N | N | Migration 063 created workspace-scoped production tables and policies; the authenticated module repository/UI is not activated. |
| COMM-03 | Message archive/trash/restore | Placeholder | Y | N | N | Y | Y | - | N | N | Schema support exists, but the module remains hidden and no production action contract is exposed. |
| COMM-04 | Branded email templates | Placeholder | Y | P | N | Y | Y | - | N | N | Production template/send tables exist, but the dormant preview is not presented as a working delivery workflow. |
| COMM-05 | Attachments and real delivery | Partial | P | P | P | Y | Y | - | N | N | Version-pinned document mappings and invoice PDF attachments exist; no email provider, delivery failure handling or resend protection exists yet. |
| COMM-06 | Delivery/send history | Missing | N | N | N | N | N | - | N | N | Invoice manual send state is not an email-delivery record. |
| PORT-01 | Portfolio project CRUD | Placeholder | Y | N | N | Y | Y | N | N | N | Migration 063 supplies workspace-scoped project persistence, but the production module remains hidden until its API/UI contract is complete. |
| PORT-02 | Portfolio media/categories/order/featured | Placeholder | Y | N | N | Y | Y | N | N | N | Schema support exists; dormant controls are not exposed as working functionality. |
| PORT-03 | Portfolio draft/publish/public rendering | Missing | N | N | N | N | N | N | N | N | Public archive does not consume Website OS portfolio records. |
| PORT-04 | Portfolio deletion/mobile archive linking | Missing | N | N | N | N | N | N | N | N | No repository or lifecycle exists. |

## Website Builder, FAQ And Publishing

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WEB-01 | Server-side workspace draft source of truth | Complete | Y | Y | Y | Y | Y | - | Y | Y | Production has one draft at revision 18; API returns revision/editor/timestamps. |
| WEB-02 | Local recovery cache | Complete | - | Y | - | P | - | - | P | Y | localStorage is recovery only and is superseded by server draft. |
| WEB-03 | Autosave, save state and timestamp | Complete | Y | Y | Y | Y | Y | - | P | Y | 700ms autosave and persisted save metadata. |
| WEB-04 | Last editor | Complete | Y | Y | Y | Y | Y | - | Y | Y | Production draft stores the authenticated editor. |
| WEB-05 | Optimistic conflict protection | Complete | Y | Y | Y | Y | Y | - | P | Y | Expected revision produces conflict instead of overwriting. |
| WEB-06 | Draft/Ready/Published/Disabled lifecycle | Partial | Y | Y | Y | Y | Y | Y | N | N | Section visibility states exist; a complete review/approval workflow is not enforced. |
| WEB-07 | Explicit publish confirmation | Complete | Y | Y | Y | Y | Y | Y | P | Y | Typed confirmation precedes publish. |
| WEB-08 | Atomic publish and failed-publish safety | Complete | Y | Y | Y | Y | Y | Y | P | Y | Security-definer transaction creates version and updates state atomically. |
| WEB-09 | Published timestamp/by and version history | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Production contains 10 versions with publisher metadata. |
| WEB-10 | Draft/live diff | Complete | Y | Y | Y | Y | Y | - | P | Y | Hero/content/section/availability change summaries are generated. |
| WEB-11 | Rollback | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Production audit has three rollbacks; Owner/Admin-only RPC is atomic. |
| WEB-12 | Multi-device draft access | Complete | Y | Y | Y | Y | Y | - | P | Y | Server draft is account/workspace scoped, not device-local. |
| WEB-13 | Live config consumption and fallback | Complete | - | Y | Y | Y | - | Y | Y | Y | `/cp` reads published content-state config and retains static fallback on failure. |
| WEB-14 | Hero desktop/mobile order and media | Complete | Y | Y | Y | Y | Y | Y | P | Y | Seven desktop and seven mobile slots persist and public fixed frames consume order/path/alt. |
| WEB-15 | Independent hero visibility | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Desktop and mobile frames independently honor their persisted `Hidden` state. |
| WEB-16 | Fixed text sections | Complete | Y | Y | Y | Y | Y | Y | P | Y | Story, What We Create, Selected Client, Process, Who This Is For, Behind Romy and Booking map to fixed public DOM. |
| WEB-17 | FAQ content management | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Eight live items are server-backed; add/edit/delete/duplicate/reorder/enable/default-open/no-default-open and rollback exist. |
| WEB-18 | FAQ accessibility | Complete | Y | Y | - | Y | - | Y | P | Y | Public buttons/regions use ARIA state and keyboard navigation. |
| WEB-19 | Footer text field | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Published footer text updates the managed public footer. |
| WEB-20 | Social/contact content fields | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Published labels, safe social URL and contact email update the public footer/navigation fields. |
| WEB-21 | Hero-line content field | Complete | Y | Y | Y | Y | Y | Y | Y | Y | The persisted hero line updates the public archive line. |
| WEB-22 | Add/duplicate/delete arbitrary page section | Complete | Y | Y | Y | Y | Y | Y | Y | Y | The public renderer creates and removes managed non-system sections from the published section model. |
| WEB-23 | Page-section ordering | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Published section order is applied to the public DOM, including Booking/FAQ order. |
| WEB-24 | Section-specific editors | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Hero, two-column story, text, campaign, image, Booking, FAQ and Footer expose type-appropriate controls. |
| WEB-25 | Draft preview fidelity | Partial | Y | Y | - | Y | - | N | P | N | Generic selected-section preview is contained but is not the exact public renderer. |
| WEB-26 | Live desktop/mobile preview | Complete | Y | Y | - | - | - | Y | P | Y | Iframes mount only on Preview and show the live public page. |
| WEB-27 | URL scheme validation | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Server validation and public rendering allow only approved relative, HTTP(S) and mailto targets; unsafe schemes fail closed. |
| WEB-28 | Static/live configuration single source | Partial | - | Y | Y | Y | - | Y | N | N | Content-state is authoritative, but defaults remain duplicated in HTML, API and JSON; legacy config-write path remains. |

## Media

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MEDIA-01 | Browse/select/assign existing assets | Complete | Y | Y | Y | Y | Y | Y | P | Y | Active target and asset assignment update draft/public static paths. |
| MEDIA-02 | Persistent upload architecture | Complete | Y | Y | Y | Y | Y | Y | P | Y | Uploads use workspace-prefixed Supabase Storage objects and persisted metadata; production upload/replace/remove is included in release acceptance. |
| MEDIA-03 | Preview and metadata | Complete | Y | Y | Y | Y | Y | Y | P | Y | Filename, category, alt, usage, status/type/date are represented. |
| MEDIA-04 | Replace | Partial | Y | Y | Y | Y | Y | Y | N | N | Works architecturally; old-object deletion is best-effort and can orphan storage. |
| MEDIA-05 | Remove and usage guard | Complete | Y | Y | Y | Y | Y | Y | P | Y | Referenced assets are protected; metadata is soft-removed. |
| MEDIA-06 | Desktop/mobile variants and gallery order | Complete | Y | Y | Y | Y | Y | Y | P | Y | Separate hero variants and sequence ordering are persisted. |
| MEDIA-07 | MIME/content validation | Complete | Y | Y | Y | Y | Y | - | Y | Y | Sharp decodes and rotates the actual file; unsupported/corrupt content, oversized images and unsafe URLs are rejected server-side. |
| MEDIA-08 | File-size validation | Complete | Y | Y | Y | - | Y | - | P | Y | 4MB server limit and allowed MIME list. |
| MEDIA-09 | Image dimensions/optimization | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Upload processing records decoded dimensions and emits optimized original/desktop/mobile WebP variants. |
| MEDIA-10 | Orphan cleanup | Partial | N | N | P | Y | Y | - | N | N | Replace attempts deletion; there is no reconciliation/retention job. |
| MEDIA-11 | Workspace scoping and authorization | Complete | - | - | Y | Y | Y | - | P | Y | DB metadata and object keys are workspace-scoped; Editor+ writes. |
| MEDIA-12 | Persistence across deployments | Complete | Y | Y | Y | Y | Y | Y | P | Y | Media metadata and objects live in Supabase rather than browser/local deployment storage. |

## Design, Responsive UI And SEO

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DESIGN-01 | Font family/weight/size/line-height/tracking controls | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Validated display/body font, weight, size and line-height settings publish through the content lifecycle. |
| DESIGN-02 | Text/background/accent color controls | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Validated COMMONPL4CE design tokens update the public CSS variables after publish. |
| DESIGN-03 | Button/radius/spacing/content-width controls | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Button treatment, radius, section spacing and content width are bounded and publishable. |
| DESIGN-04 | Logo variants, themes and brand presets | Partial | Y | Y | Y | Y | Y | Y | P | N | Header/footer/favicon/social variants are managed; the COMMONPL4CE preset is intentionally fixed and no multi-theme library is offered. |
| RESP-01 | Desktop/mobile image variants | Complete | Y | Y | Y | Y | Y | Y | P | Y | Hero supports independent desktop/mobile assets. |
| RESP-02 | Responsive typography/order/visibility controls | Partial | Y | Y | Y | Y | Y | Y | P | N | Global typography, section order/visibility and desktop/mobile media are managed; per-breakpoint type overrides remain CSS-owned. |
| RESP-03 | Mobile/tablet live preview | Complete | Y | Y | - | - | - | Y | P | Y | Mobile iframe and live pages were checked at representative widths. |
| RESP-04 | Long-heading preview containment | Complete | Y | Y | - | - | - | - | Y | Y | Preview uses safe wrapping/min-width constraints; no current overflow reproduced for the named heading. |
| RESP-05 | 320px public horizontal containment | Complete | Y | Y | - | - | - | Y | Y | Y | `/cp` measures exactly 320px at a 320px viewport; 390, 430, 768, 1024, 1280 and 1440 also have no horizontal overflow. |
| SEO-01 | Title, description, canonical and favicon | Complete | Y | Y | - | - | - | Y | Y | Y | All are present and production identity is correct. |
| SEO-02 | Open Graph/Twitter metadata | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Published title, description, canonical and social image update Open Graph/Twitter metadata. |
| SEO-03 | Indexability, robots and sitemap | Partial | Y | Y | Y | Y | Y | Y | P | N | Search visibility is publishable and validated; sitemap automation remains outside Website OS. |
| SEO-04 | Structured data | Missing | N | N | N | N | N | Y | N | N | No photographer/organization/FAQ structured data. |
| SEO-05 | Heading hierarchy and broken-link assurance | Complete | Y | Y | Y | Y | Y | Y | Y | Y | HTML validation passes, heading structure is preserved and published links use strict safe URL handling. |

## Newsletter And Settings

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NEWS-01 | Inline/popup signup flow | Complete | Y | Y | Y | Y | - | Y | P | Y | Scoped `/cp` popup and persisted newsletter request path. |
| NEWS-02 | Email validation and analytics privacy | Complete | Y | Y | Y | Y | - | Y | P | Y | Email is validated and not copied into analytics metadata. |
| NEWS-03 | Duplicate subscriber handling | Complete | - | - | Y | Y | - | Y | Y | Y | Workspace/source/normalized-email lookup returns an idempotent existing signup instead of creating a duplicate. |
| NEWS-04 | Consent provenance | Complete | Y | Y | Y | Y | - | Y | Y | Y | Consent version, timestamp and source path are persisted outside analytics events. |
| NEWS-05 | Unsubscribe and suppression | Missing | N | N | N | N | N | Y | N | N | No unsubscribe endpoint or suppression list. |
| NEWS-06 | Export and segmentation | Missing | N | N | N | Y | Y | - | N | N | Admin exposes count/recent signups only. |
| NEWS-07 | Newsletter delivery integration | Missing | N | N | N | N | N | - | N | N | Capture is not connected to a mailing provider. |
| NEWS-08 | Admin visibility | Complete | Y | Y | Y | Y | Y | - | P | Y | Authenticated analytics summary includes signup count/recent records. |
| SET-01 | Booking availability settings | Complete | Y | Y | Y | Y | Y | Y | P | Y | Draft/publish lifecycle controls `/cp-book` and server availability. |
| SET-02 | Security settings | Partial | Y | Y | Y | Y | Y | - | Y | N | Password changes, all-device and individual-session revocation and session inventory work; recovery and 2FA remain absent. |
| SET-03 | Locale preference | Partial | Y | Y | N | P | - | - | N | N | Non-sensitive local persistence only. |
| SET-04 | Business identity/domain/email settings | Partial | Y | Y | Y | Y | Y | - | P | N | Business identity and honest connection states are editable and persisted; DNS, SSL and email-provider automation are not connected. |
| SET-05 | Notification settings | Partial | Y | N | N | N | N | - | N | N | Intake notification behavior is reported read-only; no misleading editable toggle is exposed. |
| SET-06 | Design/global settings | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Design, branding, navigation, contact, SEO and integration settings use authenticated draft/publish persistence. |

## Database, Security, Reliability And Tests

| ID | Capability | Status | UI | FE | API | DB | Authz | Live | E2E | Ready | Evidence / limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OPS-01 | Migration ledger consistency | Partial | - | - | - | Y | - | - | Y | N | Production ledger now records 061-065 and the isolated runner safely excludes unapplied drift; legacy 052-060 history is still not retroactively recorded. |
| OPS-02 | Migration 058 persistent-module schema | Complete | - | - | - | Y | Y | - | Y | Y | Migration 063 idempotently reconciled message, email, portfolio and acceptance tables in production. |
| OPS-03 | Existing Website OS RLS enablement | Complete | - | - | - | Y | Y | - | Y | Y | Existing Website OS tables have RLS enabled and are service-role repository accessed. |
| OPS-04 | `task_requests` authorization policy | Complete | - | - | Y | Y | Y | Y | Y | Y | Broad public UPDATE policy was removed; direct anonymous update probes are rejected and APIs require workspace sessions. |
| OPS-05 | Effective table grants | Complete | - | - | - | Y | Y | - | Y | Y | Anonymous/authenticated Website OS privileges are revoked; service-role repository access is retained. |
| OPS-06 | Security headers / clickjacking | Complete | - | - | - | - | Y | Y | Y | Y | Admin routes ship CSP/frame-ancestors, X-Frame-Options, nosniff, HSTS, Referrer-Policy and Permissions-Policy. |
| OPS-07 | Secret handling | Complete | - | - | Y | Y | Y | - | Y | Y | Service-role credential is server-only and absent from client bundle/search; values were never printed. |
| OPS-08 | Production route identity gate | Complete | - | - | - | - | - | Y | Y | Y | Eight critical routes passed status and identity/negative-marker checks. |
| OPS-09 | Full test suite | Complete | - | - | - | - | - | - | Y | Y | `npm test` passes 137 tests including hardening, auth, content, media, invoices, business documents, policies, booking actions and inline-script parsing. |
| OPS-10 | Build/CI release gate | Complete | - | - | - | - | - | - | Y | Y | `vercel-build` runs the complete repository test suite and fails deployment on regression. |
| OPS-11 | Authenticated production E2E suite | Partial | - | - | - | - | - | - | P | N | Release acceptance covers browser/API/data workflows, but it is not yet a standalone CI-owned reusable suite. |
| OPS-12 | Acceptance fixtures | Partial | - | - | P | Y | Y | - | Y | N | Production fixture registry exists and is workspace-scoped; a generalized fixture orchestration API is still absent. |
| OPS-13 | Pagination / scaling | Partial | P | P | P | Y | Y | - | P | N | Analytics aggregation is SQL-backed; customer/invoice lists still cap at 200 without cursor pagination. |
| OPS-14 | Security/operations observability | Partial | Y | Y | Y | Y | Y | - | P | N | Auth and content/media/audit events persist; automated abuse/policy/storage alerts remain future operations work. |
| OPS-15 | Git/worktree release hygiene | Complete | - | - | - | - | - | - | Y | Y | Final integration starts from freshly fetched `origin/main` in an isolated worktree; stale local main and obsolete hotfix branches are not release sources. |
| OPS-16 | Production deployment/alias coherence | Complete | - | - | - | - | - | Y | Y | Y | Release acceptance requires the deployed production commit and every DONEOVERNIGHT project alias to match `origin/main`; the resulting deployment ID and alias verification belong to the final release report. |
| OPS-17 | Static/public performance baseline | Partial | Y | Y | Y | Y | - | Y | Y | N | Pages are responsive in synthetic checks, but config fetch is ~1.24s/no-store and asset directory is ~37MB. |

## Canonical Verdict

**READY FOR CONTROLLED PRODUCTION ACCEPTANCE, WITH DECLARED PHASE 3 LIMITS.** The former P0 authorization/grant issues, missing schema, booking availability split, builder/public mismatches, unsafe URLs, weak media validation, invoice PDF loss, missing headers and partial build gate are resolved. Business identity, versioned documents, policies, acceptance evidence and invoice document snapshots are now production-backed. Recovery/2FA, DNS/email provider automation, approved legal copy, real email delivery, public Portfolio, customer/invoice pagination, automated operational alerting and a reusable CI-owned authenticated browser suite remain explicitly incomplete; unavailable modules stay hidden from production navigation.

This matrix supersedes the earlier “Completed / Phase 3” summary. A capability may have a working UI/API and still be non-ready when its authorization, live consumer, durability, scale behavior, or direct end-to-end evidence is incomplete.
