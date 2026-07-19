# COMMONPL4CE Website OS Implementation Matrix

Canonical status for `admin.doneovernight.com/cp`. Update this document whenever a Website OS capability changes state.

- Last production acceptance: 2026-07-19
- Runtime baseline tested: `0ce95b43960a2187081a465acf6f4d10420d7096`
- Workspace: `cp` / COMMONPL4CE
- Overall status: core operations are live; Website OS as a whole is not yet feature-complete.

## Completed

| Area | Production status | Persistence / contract |
| --- | --- | --- |
| Host routing | Public `/cp`, public `/cp-book`, authenticated admin `/cp`, and unknown-admin fallback are isolated and covered by route identity tests. | `vercel.json`, `config/production-routes.json` |
| Authentication | Server-side workspace login, HttpOnly Secure SameSite session cookie, logout, refresh persistence, password change, logout-other-devices, role and workspace checks. | `website_os_workspaces`, `website_os_users`, `website_os_sessions`; `/api/website-os-auth` and the auth action in `/api/task-submit` |
| Overview | Live booking counts, upcoming activity, booking status, calendar summary, client count, invoiced revenue and paid revenue. Test, trashed and archived records are excluded where operationally required. | Authenticated `/api/admin-tasks` response |
| Bookings | Read, create, status update, archive, mark/unmark test, move to Trash, restore and Owner-confirmed permanent delete. Actions persist and write audit history. | `task_requests`, `website_os_audit_events`; `/api/admin-tasks`, `/api/admin-update-task` |
| Calendar and availability | Month navigation, today/selected states, persisted booking-status indicators, multiple bookings per date, manual blocked dates, booking collision protection, and published online/offline booking state. | Published site config plus persisted COMMONPL4CE bookings |
| Customers | Create from booking or directly, normalized email/company duplicate protection, explicit link/merge path, edit, and persisted booking/invoice links. Original bookings are not silently rewritten. | `website_os_clients`, `website_os_client_bookings`; `commonpl4ce_customer_action` |
| Invoices | Create from booking/customer, line items, quantity, unit price, VAT, dates, notes, duplicate guard, Draft/Sent/Paid/Overdue/Cancelled/Credited transitions, persisted histories, and downloadable PDF. | `website_os_invoices`, `website_os_audit_events`; `commonpl4ce_invoice_action` |
| Revenue | Two persisted metrics: Invoiced and Paid. Both use invoice subtotal excluding VAT. Invoiced includes Sent, Paid and Overdue; Paid includes Paid only. Cancelled, Credited and test-linked invoices are excluded. | `invoiceSummary.accountingRule = invoiced_and_paid_subtotals_excluding_vat` |
| Website publishing | Authenticated server-side publishing of supported text, hero static paths/order and booking availability; `/cp` and `/cp-book` read the published config with safe fallback. Local-only assets are rejected. | `commonpl4ce_site_config` record via `/api/task-submit?commonpl4ce_site_config=1` |
| Public booking | `/cp-book` and the embedded `/cp` booker share source `commonpl4ce_booker`, intake version `commonpl4ce_booker_v1`, availability and duplicate-date protection. | `/api/task-submit` |
| COMMONPL4CE analytics | Scoped `/cp` and `/cp-book` event allowlist, no raw form values in events, 24h/7d/30d summaries, scroll depth and booking conversion. Admin hosts and unrelated routes are rejected. | `analytics_events`; `commonpl4ce_analytics_event` and `commonpl4ce_analytics_summary` |
| Newsletter | Public `/cp` inline/popup signup, persisted COMMONPL4CE source, success/dismiss persistence, and admin signup metrics/recent records. Email is not copied into analytics metadata. | `task_requests` source `commonpl4ce_newsletter` |
| Interface settings | Immediate EN/NL interface switch with local non-sensitive preference, locale-aware dates, booking availability publishing and working security settings. | Locale preference is local; security and booking settings are server-side/published as described above. |

## Partially Implemented

| Area | Working now | Boundary still present |
| --- | --- | --- |
| Website Builder drafts | Section editing, hero ordering, content editing, unpublished-state tracking, comparison and live config publishing work. | Draft workspace state is stored per device until published; there is no server-side draft history, versioning, rollback or multi-user conflict resolution. |
| Media Library | Existing static/repository assets can be selected, assigned to desktop/mobile hero slots and published. Local image previews are validated and blocked from live publishing. | Persistent upload, replace, delete, storage metadata and image processing are not connected. |
| Invoice delivery | PDF generation and explicit Sent state/history work. | Marking Sent records the action only; it does not email the invoice. Paid is a deliberate manual status, not payment-provider reconciliation. |
| Customer communication history | Booking links and invoice send/payment events appear on the customer. | Message threads and outbound email records are not yet connected, so this is not a complete communication timeline. |
| Test-record maintenance | Individual bookings can be marked/unmarked as test and are excluded from production metrics and availability. | The bulk `Delete test records` control remains disabled; permanent deletion stays per-record and Owner-confirmed. |
| Acceptance fixtures | The persistent fixture table exists and disposable production acceptance flows can be executed and cleaned safely. | A committed, reusable acceptance runner with automatic expiry cleanup is not yet part of the release gate. |

## Remaining Phase 3

| Area | Required completion |
| --- | --- |
| Messages / Replies | Authenticated thread/message repositories and APIs, draft persistence, archive/trash/restore, inbound synchronization and explicit delivery. The production navigation remains hidden. |
| Branded Emails | Persistent template CRUD, variable validation, previews, test sending, explicit real sending, provider delivery status and failure handling. The production navigation remains hidden. |
| Portfolio | Persistent project/media CRUD, ordering, preview, publish integration and public rendering. The production navigation remains hidden. |
| Persistent Media | Workspace-scoped object storage, upload/replace/delete APIs, MIME and size enforcement, usage guards, transformations and cleanup. |
| Server-side Drafts | Per-user/shared draft persistence, revisions, optimistic concurrency, rollback and publish audit snapshots. |
| Billing Integrations | Actual invoice email delivery, payment-provider or accounting-provider synchronization, automatic overdue handling, reconciliation and complete credit-note workflow. |
| Security | Two-factor authentication and recovery flow. |
| Acceptance Automation | Seed/cleanup commands based on `website_os_acceptance_fixtures`, cross-role browser tests and mandatory CI/release execution. |

## Production Acceptance Evidence

The 2026-07-19 disposable acceptance flow verified:

1. Booking creation.
2. Customer creation from that booking and persisted booking/customer link.
3. Draft invoice creation with correct subtotal, VAT and total.
4. Valid PDF generation and invocation from the live invoice detail UI.
5. Sent and Paid transitions with persisted history.
6. Bidirectional customer, booking and invoice relationships after refresh.
7. Invoiced and Paid revenue each increased by the invoice subtotal excluding VAT.
8. Full authenticated page refresh preserved the dashboard state without console errors.
9. Fixture booking, customer, link, invoice, audit records and temporary sessions were removed.
10. The eight-route production safety suite passed after cleanup.
