# COMMONPL4CE Business Identity And Client Documents

## Purpose

This module gives the `cp` Website OS workspace one server-side source for its business identity, legal documents, customer-facing policies, policy acceptance evidence and invoice document attachments. It reuses Website OS users, sessions, workspace authorization, audit events, invoices and media references.

It does not create a second auth system, send email, automate DNS, or expose service-role credentials to the browser.

## Architecture

```text
Authenticated Website OS user
  -> admin-update-task business action
  -> Website OS role + workspace context
  -> scoped repository / transactional RPC
  -> Supabase service-role boundary
  -> workspace-scoped records

Public /cp or /cp-book
  -> read active customer-visible booking policies
  -> customer accepts exact policy IDs
  -> task-submit validates current published versions
  -> booking and immutable acceptance records commit together or fail closed
```

The browser never supplies a trusted workspace ID, user ID, role, published version, or acceptance version. These values are resolved server-side.

## Business Identity

`website_os_business_profiles` stores one identity per workspace. It contains legal/contact/brand/invoice defaults and references Website OS media when available. Updates require Owner or Admin and an expected revision.

`website_os_domains` stores custom/subdomain status. This release records manual verification honestly; it does not change DNS or provision SSL.

`website_os_email_identities` stores the future sending identity and provider type. Provider verification and delivery remain disconnected until credentials and a delivery adapter exist.

## Documents And Versions

`website_os_documents` is the mutable workspace draft. Owner, Admin and Editor can save a draft using optimistic revision protection.

Publishing is Owner/Admin only. `website_os_publish_document` locks the draft, verifies its expected revision, creates an immutable `website_os_document_versions` row and switches the document pointer in one database transaction. A failed operation leaves the previous published version current.

Rollback never mutates history. It creates a new immutable version copied from an earlier version and records the source version.

PDF export is server-generated with the saved business identity. Export does not publish or send the document.

## Workflow Attachments

`website_os_document_workflows` maps active documents to:

- booking confirmation;
- invoice;
- branded email;
- customer welcome;
- project start;
- manual email;
- future client portal.

Only the invoice consumer is active in this release. Other mappings are durable architecture for later delivery modules and are never represented as sent.

Invoice links store the exact immutable document version in `website_os_invoice_documents`. Draft invoices can select active published documents; generated PDFs list and append those exact versions. Existing invoice send behavior remains an explicit manual status and never sends automatically.

## Policies And Acceptance

`website_os_policies` selects a document, requirement, visibility, order and acceptance contexts. Public booking forms only receive enabled, customer-visible booking policies whose linked document has an active published version.

Required policy IDs are validated server-side before a booking is stored. The acceptance RPC derives the current document/version from the database, verifies the booking belongs to the COMMONPL4CE workspace and inserts an immutable record. It stores a one-way email hash and request fingerprint rather than raw email or IP address.

When an authorized Owner or Admin later links that booking to a customer, a separate security-definer RPC links only previously unlinked acceptance rows for that exact workspace and booking. It verifies the persisted booking/customer relation and never changes the accepted version, timestamp or customer snapshot.

If acceptance persistence fails after task insertion, the newly-created booking is removed and the request fails. No legally ambiguous booking is reported as successful.

## Authorization

- Read: authenticated Owner, Admin, Editor or Viewer in the `cp` workspace.
- Identity/domain/email writes: Owner or Admin.
- Document draft/create/duplicate/PDF: Owner, Admin or Editor; Viewer can export only.
- Document publish/rollback/archive: Owner or Admin.
- Policy writes: Owner or Admin.
- Invoice attachment writes: Owner or Admin through the existing invoice contract.
- Public policy read/acceptance: `/cp` and `/cp-book` only; admin hosts and unrelated paths are rejected.

Every table has RLS enabled. Browser roles have no table grants. Server operations use the existing service-role repository only after authentication and workspace resolution.

## External Integrations Still Required

- Transactional email provider and delivery/webhook reconciliation.
- DNS ownership challenge and SSL provisioning adapter.
- Provider-specific Google Workspace, Microsoft 365 or SMTP verification.
- Customer portal delivery and authenticated document access.
- Legal review and approved COMMONPL4CE document copy; the product does not invent legal terms.

## Creator OS Roadmap

1. Keep all current tables workspace-scoped and remove the remaining `cp` route assumption from public policy adapters.
2. Add per-workspace module entitlements and document templates without copying schemas.
3. Add a provider-neutral email delivery adapter that consumes the existing identity and workflow mappings.
4. Add verified domain challenges and certificate state as background jobs, leaving manual records intact.
5. Add portal delivery using immutable document-version links and acceptance events.
6. Move shared UI renderers from the COMMONPL4CE single-file shell into reusable Creator OS components only after production behavior is stable.

COMMONPL4CE remains on the same records and API contracts during this evolution; no destructive migration or client-data copy is required.
