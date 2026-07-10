# DON Motion System v1.0 — Accessibility Review

Review status: Specification pass

Production integration status: Not started

## Principles

1. Motion never carries unique information.
2. DON remains useful when completely still.
3. The character sprite does not become an extra focus target.
4. Completion, errors, progress, and notifications remain product UI responsibilities.
5. Reduced motion removes automatic movement without removing semantic state.

## Reduced-motion mapping

| State or action | Reduced behavior |
|---|---|
| Idle | Still neutral frame |
| Blink | Disabled automatically |
| Eye movement | Disabled automatically |
| Hover | No jump; normal control hover/focus feedback remains |
| Thinking | Still Thinking frame |
| Typing | Still laptop focus frame |
| Listening | Still Listening frame |
| Speaking | Still neutral Speaking frame |
| Sleep | Still closed-eye frame |
| Celebrate | Still peak frame for 480 ms |
| Success | Still happy-eye frame for 480 ms |
| Working | Still laptop work frame |
| Wave | Still raised-arm frame for 480 ms when explicitly requested |

Switching reduced motion on cancels at a safe frame. Switching it off schedules a fresh quiet window and never replays missed movement.

## Semantics

Recommended behavior:

```text
sprite or canvas: aria-hidden="true"
DON control: accessible name and visible label
task status: separate visible text
completion announcement: independent polite live region when needed
```

The character must not announce Idle, breath, blink, glance, Hover, Wave, or Sleep cycles.

## Keyboard

- keyboard focus receives the same Hover eligibility as pointer hover;
- the actual control owns the focus-visible ring;
- focus never moves because animation begins or ends;
- animation cannot block Enter, Space, Escape, Tab, or text entry;
- repeated focus events cannot stack Hover;
- chat open follows the product's established focus-management policy.

## Screen readers

- sprite frames remain hidden from the accessibility tree;
- state changes are announced only when product meaning changes;
- live regions use `polite` for completion and noncritical status;
- no live region repeats animation frame names;
- no generated message relies on eye expression or body motion;
- motion failure does not hide content or controls.

## Cognitive load

- no constant motion;
- no repeated prompts tied to animation;
- no automatic chat opening;
- no artificial urgency;
- no confetti or high-frequency particles;
- Celebrate restricted to major milestones;
- one active animator per viewport;
- quiet windows and cooldowns prevent repeated attention capture.

## Vestibular safety

- maximum Idle displacement is 1 logical pixel;
- no zoom, spin, rotation, parallax, or full-screen movement;
- Hover is user-triggered, short, locked, and disabled by reduced motion;
- no continuous bouncing;
- no spring or elastic easing;
- no motion blur.

## High contrast and forced colors

DON's visual palette is not used as the sole control-state signal.

- focus indicators remain normal UI;
- product status remains text;
- buttons retain platform contrast behavior;
- cyan eyes are decorative, not informational;
- the sprite may be hidden without losing functionality.

## Mobile accessibility

- touch does not emulate Hover jumps;
- scrolling never triggers motion;
- app background pauses immediately;
- reduced-motion platform settings are observed;
- controls meet product touch-target requirements independently of sprite size;
- haptics and audio are not required.

## Approval checklist

- [x] Reduced-motion behavior specified for every state and gesture.
- [x] Animation is never the only information channel.
- [x] Sprite is separate from interactive semantics.
- [x] Keyboard and pointer eligibility are equivalent where Hover exists.
- [x] Motion does not move focus.
- [x] Live-region policy is independent of animation.
- [x] Hidden and offscreen motion pauses.
- [x] Motion remains compact and noncontinuous.
- [ ] Validate with real browser accessibility tree after integration.
- [ ] Test screen readers after integration.
- [ ] Test native mobile accessibility after integration.
- [ ] Complete user testing with reduced-motion users before production release.

The unchecked items require a future integration implementation and are intentionally outside this specification release.
