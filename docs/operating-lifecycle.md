# DONEOVERNIGHT Operating Lifecycle

This document captures the production lifecycle rules that must stay consistent across Ask, Admin, Review, Email, Payments, Workspace, Dispatch, and future Operator OS work.

## Client Language

Client-facing language should use:

- Execution Plan
- Review Execution Plan
- Approve & Start
- Awaiting Start
- Project Active
- Delivered
- Completed

Avoid client-facing `Quote`, `Pay Now`, and `Payment Request` wording.

Client-facing payment provider names are not part of the product language. Clients should only see:

```txt
Review Execution Plan
Approve & Start
Secure Checkout
Workspace Activation
```

## Current Lifecycle

The current lifecycle is:

```txt
New
Needs Info
Review Complete
Execution Plan Ready
Awaiting Start
Project Active
Delivered
Completed
Archived
```

Compatibility states still exist in code for older records, including `quote_sent`, `quoted`, `awaiting_payment`, `payment_confirmed`, `workspace_active`, and `execution_active`. These must map into the client-facing lifecycle without changing the underlying historical record.

## Execution Plan And Secure Checkout

Admin Send Plan must:

- save the execution plan amount, ETA, note, and internal checkout destination
- preserve the secure review token flow
- set the task into `execution_plan_ready` / awaiting-start compatible state
- send the client back to the secure review page, not directly to payment infrastructure
- keep workspace locked until payment/start is confirmed

If no custom checkout destination is provided, DONEOVERNIGHT generates an internal infrastructure destination and keeps it behind DONEOVERNIGHT Secure Checkout.

```txt
https://pay.doneovernight.com/?task_id=<DON reference>&token=<review token>
```

The underlying infrastructure destination must include the DON reference and task reference in its encoded description so manual payment matching is possible. Client-facing email and review pages must never show raw provider names or raw provider URLs.

## Revenue Recovery Architecture

Revenue recovery is prepared as a lifecycle model, not fake automation.

Future follow-up states:

- `awaiting_start_24h`
- `awaiting_start_72h`
- `awaiting_start_7d`
- `referral_request`
- `archived`

Admin should eventually show:

- Days Waiting
- Last Contact
- Next Follow-up
- Recommended Action

Recovery actions must only appear when relevant to the task state.

## Needs Info Workflow

The current prepared flow is:

```txt
Admin Request Information
↓
Task moves to Needs Info
↓
Client receives shared-template email
↓
Client opens secure review page
↓
Client supplies the missing information
↓
Admin resumes review
```

Future upload/reply support should attach answers and files to the task activity timeline.

## Activity Timeline

Every task should eventually support immutable activity entries:

- Task Created
- Review Opened
- Needs Info Sent
- Execution Plan Sent
- Execution Plan Viewed
- Approve & Start Clicked
- Payment Received
- Workspace Activated
- Operator Assigned
- Project Started
- Delivered
- Completed
- Archived

The timeline should be visible in Admin and must not expose review tokens.

## Funnel Tracking Architecture

The business funnel is:

```txt
Visit
Ask
Review
Execution Plan
Approve
Pay
Workspace
```

Existing tracking hooks include Review Opened, Execution Plan Viewed, Approve & Start Clicked, Payment Link Clicked, and Workspace Opened. Analytics should read first-party `analytics_events` rows and Supabase task state changes only.

## Email Open And Review Click Tracking

Email open tracking is not currently implemented. If added, it should be privacy-conscious and optional.

Review click tracking should happen on the review page after secure token authorization and should record event type, task reference, state, and timestamp without logging the raw token.

## Operator OS Permissions

Operator CAN see:

- Task
- Files
- Scope
- Timeline
- Deliverables
- Workspace
- Assigned work

Operator CANNOT see:

- Admin keys
- Review tokens
- Revenue recovery controls
- Analytics
- Payment controls
- Platform secrets
- Client payment links unless explicitly required for assigned delivery operations

## Operator Revenue Architecture

Future payout architecture:

```txt
Client Pays
↓
Platform Fee
↓
Operator Allocation
↓
Operator Payout
```

Do not build payouts until Admin remains the source of truth for payment confirmation, workspace activation, and operator assignment.

## Workspace Activation

Current model:

```txt
Payment / start confirmed
↓
Admin activates workspace
```

Future model:

```txt
Payment Confirmed
↓
Workspace Activated
↓
Client Notified
↓
Operator Notified
```

Until automatic payment verification exists, workspace activation must remain admin-controlled.
