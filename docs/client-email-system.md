# DONEOVERNIGHT Client Email System

This is a permanent operating rule for DONEOVERNIGHT.

DONEOVERNIGHT has one client-facing email design system. The Ask/Task confirmation email is the source of truth, and every client-facing lifecycle email must use the shared renderer in `lib/email/client-template.js`. The renderer mirrors the production n8n Task Received HTML shell: dark `#050505` background, centered 640px card, rounded outer container, production logo picture block, hero card, status label, task/reference block, two status cards, gold CTA, and footer.

Client email variants include:

- Request received
- Additional information required
- Execution plan ready
- Awaiting start
- Payment confirmed
- Project active
- Delivered
- Completed
- Revenue recovery
- Referral request

These are states of the same template, not separate templates.

## Rules

- Do not create a separate quote, payment, delivery, recovery, or referral email template.
- Do not recreate, generate, replace, or fall back from the DONEOVERNIGHT logo.
- Do not use text-logo replacements or alternate branding.
- Use the production logo source from the shared template.
- Keep header, logo placement, card structure, spacing, typography, footer, responsiveness, mobile behavior, and visual hierarchy identical.
- Only headline, body copy, CTA text, CTA destination, and status information may change.

## Implementation

All client-facing emails must call:

```js
buildClientEmail(...)
```

from:

```txt
lib/email/client-template.js
```

The current production logo source is:

```txt
https://doneovernight.com/brand/doneovernight-neutral.png
```

## Execution Plan Email

The execution plan email must be short. Its purpose is only to get the client back to the secure review page. Execution plan details live on Review.

Required content:

- Status label: `EXECUTION PLAN READY`
- Headline: `Execution plan ready.`
- Greeting: `Hi <client_name>,`
- Intro: `Your execution plan is ready to review.`
- Lead: `Review the scope, timing, investment, and start step inside your secure review page.`
- Reference: DON reference
- CTA: `Review Execution Plan`
- CTA destination: `secure_review_url`

Do not show investment amounts, timelines/ETAs, scope text, deliverables, payment links, raw payment fallback links, secure checkout links, provider names, giant quote tables, technical details, internal statuses, or operator information in the email.

## Review And Secure Checkout Flow

The client journey is:

```txt
Email -> Review Execution Plan -> Approve & Start -> Secure Checkout -> Workspace Activation
```

The review page contains scope, timeline, deliverables, investment, and why-start-now content. The email does not.

## Regression Test

Any future email change must verify:

- Every client-facing email uses `buildClientEmail`.
- Every variant uses the same logo source.
- No second visual email template is introduced.
- No text-logo replacement is introduced.
- Execution plan CTA uses the secure review URL first.
- Payment link is not visible in email body.
