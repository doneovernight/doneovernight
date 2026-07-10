# DONEOVERNIGHT Website Constitution

Status: Phase 1 foundation  
Applies to: the public website, website-owned intake, and future website experiences  
Does not authorize: a production redesign or deployment

## 1. Positioning

DONEOVERNIGHT is an overnight execution service and operating layer for focused digital work. The website must make the promise precise: a clear request goes in before bed; a useful result, decision, or next step is ready by morning. It must not imply that every project can be completed overnight or that automation replaces judgment.

The website should present DONEOVERNIGHT as:

- an execution partner, not an agency catalogue;
- a system with accountable human operators, not an autonomous AI product;
- a place where websites, automations, brand systems, funnels, and operational fixes connect;
- calm, premium, direct, and operationally credible.

## 2. Target audiences

Primary audiences:

1. Founders and owner-operators with a clear blocker or opportunity.
2. Creative businesses that need an idea turned into a working system.
3. Operators and internal teams that need a repeated process made reliable.
4. Existing clients returning to a workspace, task, quote, or delivery.

Secondary audiences:

- potential DONEOVERNIGHT operators;
- partners and enterprise buyers evaluating trust and delivery architecture;
- visitors learning from real systems, case studies, resources, and the journal.

## 3. Conversion goals

The primary conversion is a qualified, well-scoped request through Ask DONEOVERNIGHT. Supporting conversions are:

- understanding what fits overnight;
- opening a relevant service or capability page;
- examining proof or a case-study breakdown;
- returning to a protected client or operator surface;
- subscribing only where a clearly described subscription exists;
- choosing an honest next step when work is too broad for overnight delivery.

Conversion must never rely on false urgency, obscured pricing, disguised advertising, or misleading completion claims.

## 4. Proof strategy

Proof should demonstrate the operation of real systems rather than substitute volume metrics for trust. Preferred proof:

- before/after states with scope and constraints;
- short process timelines;
- named system surfaces and working flows;
- screenshots or floating product windows showing real interfaces;
- measurable outcomes that can be sourced and dated;
- clear labels for prototypes, prepared capabilities, and live production systems.

Testimonials and metrics must be attributable. Draft, planned, prepared, and coming-soon work must never be presented as shipped.

## 5. Design principles

1. **System before spectacle.** Every visual decision must clarify structure, sequence, or meaning.
2. **Restraint creates life.** Motion and character should be noticeable because they are selective.
3. **Black, white, graphite, one accent.** The restrained warm accent identifies attention, progress, and completion.
4. **Real interfaces over device theatre.** Product windows may float; a MacBook frame is not the default proof container.
5. **Editorial space, operational detail.** Large typographic moments coexist with precise labels, statuses, and evidence.
6. **Original assets.** DONEOVERNIGHT characters and symbols must not copy another company’s mascot, silhouette, pixel treatment, proportions, colors, or artwork.
7. **Content remains primary.** Assistive and decorative layers must never cover the main action or required information.

## 6. Typography rules

- Instrument Serif is the expressive display voice.
- Manrope is the primary interface and reading voice.
- JetBrains Mono is reserved for labels, system status, identifiers, timestamps, and compact metadata.
- Display type may be large but must preserve readable line breaks from 320px upward.
- Body copy should normally remain between 15px and 19px with a line height of at least 1.5.
- All-caps labels require increased letter spacing and should be short.
- Faux bold, condensed body copy, and long italic paragraphs are prohibited.
- Font loading must use fallbacks and must not cause material layout shift.

## 7. Spacing rules

- Use an 8px base rhythm with intentional 4px exceptions for compact controls.
- Primary page gutters: 24px on small screens, 6vw or a capped 1360px container on larger screens.
- Major sections should use 72–128px vertical spacing, reduced proportionally on mobile.
- Interactive targets should be at least 44px in either height or combined hit area where possible.
- Safe-area insets must be honored for fixed mobile controls.
- Floating elements must reserve their own predictable bounds and must not create layout shift.

## 8. Interaction rules

- Links navigate; buttons perform actions.
- Keyboard, pointer, touch, and assistive-technology paths must reach the same functions.
- Focus indicators are always visible and use the restrained accent or a high-contrast neutral.
- Controls expose their current state with native semantics such as `aria-expanded`, `aria-pressed`, status text, or selected values.
- Hover may enrich understanding but may not reveal required information exclusively.
- Forms preserve entered data on recoverable errors and explain the next corrective action.
- Assistant messages are contextual prompts, never modal interruptions by default.

## 9. Motion rules

- Default motion is nearly still.
- Transform and opacity are preferred; layout-affecting animation is prohibited without a measured reason.
- Infinite motion is limited to subtle, low-amplitude ambient behavior.
- Natural behavior uses varied timing rather than a visibly fixed loop.
- Repeated triggers must not stack animations.
- Completion animation occurs only after an explicit completion event.
- `prefers-reduced-motion` is respected, and all functions remain available when motion is disabled.
- Future parallax must communicate depth or sequence, never merely decorate scrolling.

## 10. Accessibility rules

- Target WCAG 2.2 AA for public and protected website surfaces.
- Use semantic HTML before ARIA.
- Maintain 4.5:1 contrast for normal text and 3:1 for large text and meaningful UI boundaries.
- Provide text alternatives for informative imagery and empty alt text for decorative imagery.
- Do not use color as the only state signal.
- Preserve zoom, text reflow, and orientation flexibility.
- Fixed assistants and notices must not block content or controls at 320px width.
- All experiences must be understandable and operable without animation, audio, or hover.

## 11. Trust principles

- Distinguish public, protected, and internal surfaces visibly.
- Collect only data required for the stated function.
- Never connect a prototype to production data by convenience.
- Explain whether a message is deterministic, AI-generated, or human-authored.
- Do not imply that an LLM has access to client systems unless that access is explicitly configured and disclosed.
- Preserve legal, privacy, satisfaction, trust, and enterprise pages through redesigns.
- Protected previews use existing authentication where practical and remain `noindex` and absent from the sitemap.

## 12. Behavioral psychology boundaries

Allowed:

- progressive disclosure;
- clear defaults;
- truthful social proof;
- reducing decision load;
- showing progress and completion;
- contextual prompts that are easy to dismiss.

Not allowed:

- fake scarcity or countdowns;
- confirm-shaming;
- preselected consent;
- disguised ads or sponsored results;
- obstructive assistant behavior;
- emotional manipulation based on inferred vulnerability;
- collecting behavioral data without a declared operational purpose.

## 13. Performance standards

- Public landing routes should target Core Web Vitals in the “good” range at the 75th percentile.
- New route-level JavaScript must be justified and measured.
- Optional assistant or chat behavior is lazy-loaded and excluded from routes that do not use it.
- Prefer CSS and native platform APIs to animation frameworks for small interactions.
- Images require explicit dimensions and appropriate formats.
- No new third-party script may be added without purpose, owner, privacy impact, and failure behavior.
- A new fixed component must produce no measurable layout shift.
- Bundle or asset-size comparison is required before release.

## 14. Progressive enhancement

The core promise, navigation, proof, service information, and contact path must remain usable when optional JavaScript fails. JavaScript may enhance state, previews, motion, and client-side convenience. It must not silently remove access to required content.

Prototype messages are deterministic local content. Future conversational behavior must have a readable non-chat path and explicit failure states.

## 15. Future interactive portfolio architecture

The future portfolio should use a composable scene model:

- a story controller owns progress and scene state;
- each product window is an independent, accessible component;
- screenshots, video, and live demonstrations have documented provenance;
- scenes can render as static stacked content when motion is reduced or JavaScript is unavailable;
- product data is separated from scene choreography;
- every interactive demonstration identifies whether it is live, simulated, or recorded.

Planned system windows include the public website, login, admin environment, booking station, client workspace, operator workspace, HQ, and mobile companion views.

## 16. Future parallax and scrollytelling rules

- Scrolling remains under the visitor’s control; no scroll hijacking.
- A scene must have a static reading order before enhanced choreography is added.
- Parallax depth is capped to avoid motion sickness and content drift.
- Pinning is used sparingly and ends predictably.
- Mobile receives a purpose-built sequence, not a compressed desktop scene.
- Reduced-motion mode removes parallax, long travel, auto-rotation, and pinned transformations.
- Real system windows float in a shared spatial field; they are not all forced into laptop frames.

## 17. Future “Inside DONEOVERNIGHT” experience

“Inside DONEOVERNIGHT” will let visitors watch a request move through the real operating system:

1. public website and Ask intake;
2. login or identity handoff;
3. Admin triage and scope;
4. booking or payment readiness where applicable;
5. client workspace activation;
6. operator workspace execution;
7. HQ signal and oversight;
8. mobile companion status.

The experience must use sanitized or purpose-built demonstration data, clearly label simulated steps, preserve client confidentiality, and provide a static narrative alternative.

## 18. Governance

- Production deployment requires explicit Donovan approval.
- Every phase begins from a recorded production commit and deployment.
- A remote backup branch and tag are created before material website changes.
- Existing routes, forms, APIs, analytics, SEO files, logo, and footer receive regression checks.
- A protected preview is reviewed before any public integration.
- The constitution changes only through an explicit, documented decision.
