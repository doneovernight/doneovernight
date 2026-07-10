# DON Assistant Phase 1 Specification

## Purpose

DON is a small original DONEOVERNIGHT operator and guide. The Phase 1 component demonstrates behavior, accessibility, performance boundaries, and a deterministic message bubble. It does not provide chat, collect data, or call an LLM.

## Canonical location

`components/don-assistant/`

- `don-assistant.js` — composition and public controller API;
- `state-machine.js` — allowed states and state transitions;
- `bubble.js` — deterministic messages and expand/collapse behavior;
- `motion-controller.js` — blink, triple-jump, and success orchestration;
- `accessibility-controller.js` — keyboard, focus, hover, and bubble bindings;
- `styles.css` — original character, state appearance, motion, safe-area behavior.

## Public API

```js
const assistant = new DONAssistant(target, options);

assistant.setState("listening");
assistant.setMessage("Want to see how the system works?");
assistant.setExpanded(false);
assistant.setReducedMotion(true);
assistant.useSystemMotionPreference();
assistant.jump();
assistant.success();
assistant.destroy();
```

An explicit `donassistant:success` window event also triggers the celebration state.

## Required states

| State | Meaning | Visual behavior |
|---|---|---|
| `idle` | Default available state | Almost still; subtle breathing; scheduled natural blink. |
| `blink` | Short eye closure | Varied interval, with occasional slower blink. |
| `sleep` | Extended idle | Lower posture and closed visor. |
| `awake` | Re-engaged | Open attentive visor. |
| `hover` | Motion-free interaction feedback | Attentive eye state. |
| `triple_jump` | Pointer or keyboard engagement | Exactly three low jumps, one animation instance. |
| `listening` | Accepting input in a future product | Raised arm and quiet signal. |
| `thinking` | Processing in a future product | Three restrained signal bars. |
| `speaking` | Presenting a future response | Small signal waveform. |
| `success` | Explicit completion event | One short celebration; never random. |
| `collapsed` | Bubble minimized | Compact status and expand control. |
| `expanded` | Bubble visible | Full deterministic message. |

## Triple-jump contract

- `triggerTripleJump()` sets a synchronous `isJumping` lock.
- Further hover/focus/activation triggers return `false` while locked.
- The CSS animation `don-triple-jump` contains exactly three negative-translation peaks: 13px, 11px, and 9px.
- The `animationend` event clears the class and lock, returns to `idle`, and resumes blink scheduling.
- Blinking is suppressed while jumping.
- Reduced-motion mode supplies the same interaction feedback through a short state change without the jump class.

## Blink contract

- Blink delay varies from 2.8 to 7.2 seconds.
- A separate random sample produces an occasional slow blink.
- There is no fixed interval and no `requestAnimationFrame` loop.
- Blink scheduling pauses for jump and celebration motion.
- Blink runs only in calm interactive states.

## Message bubble

Allowed Phase 1 messages:

- “Looking for something specific?”
- “Want to see how the system works?”
- “Tell me what your business needs.”
- “Your next step is ready.”

Any unknown message falls back to the first allowed message. The bubble uses `aria-live="polite"`; its control exposes `aria-expanded` and a state-specific accessible name.

## Accessibility

- The character is a focusable `role="button"` control with an accessible name.
- Focus behaves like hover and requests the same controlled jump.
- Enter and Space activate the same function.
- The bubble toggle is a native button.
- Focus-visible styles meet the component contrast direction.
- System reduced-motion preference is observed and can be overridden by the lab control.
- Every function remains available with animation removed.
- The component does not trap focus, open a modal, or intercept the page’s primary actions.

## Placement and layout

- Fixed placement uses right and bottom safe-area insets.
- The component owns a capped width and reserved character height.
- `contain: layout paint style` isolates component layout.
- Overlay mode uses `pointer-events: none` on the wrapper and restores pointer events only on controls.
- Mobile dimensions are capped against viewport width.
- No component code is loaded on routes that do not import it.

## Visual direction

DON is not a robot cliché and is not pixel art. The form is a small graphite operator: a hooded, soft-edged working silhouette with a narrow warm visor, one vertical operational mark, and restrained signal bars. The palette uses black, graphite, warm white, and one muted amber accent.

The design does not copy the Codex mascot or another company’s silhouette, proportions, colors, pixels, or artwork.

## Preview route protection

`/labs/don-assistant`:

- calls `/api/hq-session` before rendering in deployed environments;
- reveals no prototype controls on failed authentication;
- links to the existing HQ login;
- bypasses the gate only on `localhost`, `127.0.0.1`, or `::1` for local testing;
- uses `noindex, nofollow, noarchive`;
- is disallowed in `robots.txt` and absent from the sitemap;
- loads no analytics scripts and sends no assistant events.

## Performance budget

- zero image payload for the character;
- zero new runtime dependency;
- CSS transform/opacity motion only;
- no continuous JavaScript loop;
- no layout-affecting animation;
- initial route impact limited to the component modules and two stylesheets on the lab route only.

## Test coverage

Node tests cover state completeness, valid transitions, triple-jump completion, animation-stack prevention, varied blink timing, blink suppression during jump, reduced-motion behavior, explicit success, three jump peaks, safe-area CSS, no-layout-shift safeguards, lab access markers, no analytics/LLM behavior, and unchanged homepage form/footer markers.
