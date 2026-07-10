# DON Motion Implementation Guide

Motion System version: `1.0.0`

Status: Implementation contract; no website integration in this release

## 1. Responsibility boundary

The DON motion engine has four responsibilities:

1. accept semantic events;
2. resolve finite-state transitions;
3. schedule approved sprite sequences and micro-actions;
4. render versioned frames according to metadata.

It does not:

- generate language;
- decide product status;
- open chat automatically;
- write accessible announcements;
- change DON's visual construction;
- infer success from elapsed time;
- trigger sales prompts;
- own notification content;
- modify page layout.

Product code reports truth. The motion engine reflects it.

## 2. Recommended package boundary

Future implementation should expose one framework-neutral controller.

```text
@doneovernight/don-motion
  controller
  state machine
  scheduler
  renderer adapter contract
  motion metadata
  reduced-motion profile
  tests
```

Framework integrations wrap this controller. They do not fork timing, state rules, or sprite metadata.

Suggested public surface:

```text
createDONMotionController(options)
controller.request(state, context)
controller.handle(event, payload)
controller.pause(reason)
controller.resume(reason)
controller.setReducedMotion(value)
controller.getSnapshot()
controller.destroy()
```

No public method exposes `frameIndex`, anatomy offsets, eye coordinates, or prop visibility.

## 3. Pseudo implementation

This pseudocode defines behavior. It is not production website code.

```ts
type DONState =
  | "Idle"
  | "Hover"
  | "Thinking"
  | "Typing"
  | "Listening"
  | "Speaking"
  | "Sleep"
  | "Celebrate"
  | "Success"
  | "Working";

type MotionRequest = {
  state: DONState;
  reason: string;
  priority: number;
  variant?: "default" | "laptop";
  returnState?: DONState;
};

class DONMotionController {
  private current: DONState = "Idle";
  private previous: DONState = "Idle";
  private queue: MotionRequest | null = null;
  private transitionToken = 0;
  private bodyLocked = false;
  private visible = true;
  private documentActive = true;
  private reducedMotion = false;
  private hoverCooldownUntil = 0;
  private hoverExitObserved = true;
  private microTimer: number | null = null;

  async request(request: MotionRequest): Promise<boolean> {
    if (!this.visible || !this.documentActive) {
      this.drawReducedFrame(request.state);
      return false;
    }

    if (this.reducedMotion) {
      this.commitState(request.state);
      this.drawReducedFrame(request.state);
      return true;
    }

    if (!this.isAllowed(request)) return false;

    if (this.bodyLocked) {
      this.queue = chooseHighestPriority(this.queue, request);
      return false;
    }

    const route = routeTransition(this.current, request.state);
    const token = ++this.transitionToken;
    this.cancelMicroMotion();

    for (const step of route) {
      if (token !== this.transitionToken) return false;
      await this.playTransition(step, token);
    }

    this.previous = this.current;
    this.current = request.state;
    this.schedulePermittedMicroMotion();
    return true;
  }

  async playSequence(name: string, options: SequenceOptions): Promise<void> {
    const sequence = manifest.sequences[name];
    const token = this.transitionToken;

    this.bodyLocked = sequence.lock === "body";

    for (let index = 0; index < sequence.frames.length; index += 1) {
      if (token !== this.transitionToken || !this.canRender()) break;
      this.renderer.draw(sequence.frames[index]);
      await wait(sequence.durationsMs[index]);
    }

    this.bodyLocked = false;
    this.applySequenceCooldown(sequence);
    this.flushQueueAtSafePoint();
  }

  handleHoverEnter(): void {
    const eligible =
      this.current === "Idle" &&
      !this.bodyLocked &&
      this.hoverExitObserved &&
      now() >= this.hoverCooldownUntil &&
      !this.reducedMotion;

    if (!eligible) return;

    this.hoverExitObserved = false;
    this.request({
      state: "Hover",
      reason: "eligible-hover",
      priority: 70,
      returnState: "Idle"
    });
  }

  handleHoverExit(): void {
    this.hoverExitObserved = true;
  }

  schedulePermittedMicroMotion(): void {
    if (!microActionsAllowed(this.snapshot())) return;

    const quietWindow = sampleQuietWindow(this.current);
    this.microTimer = window.setTimeout(() => {
      const action = selectWeightedMicroAction(this.snapshot());
      if (action) this.playMicroAction(action);
      this.schedulePermittedMicroMotion();
    }, quietWindow);
  }

  pause(reason: PauseReason): void {
    this.transitionToken += 1;
    this.cancelAllTimers();
    this.bodyLocked = false;
    this.renderer.draw(reducedFrameFor(this.current));
  }

  destroy(): void {
    this.pause("destroy");
    this.queue = null;
    this.renderer.destroy();
    this.observers.disconnect();
  }
}
```

## 4. Renderer contract

The renderer accepts only approved frame keys.

```ts
interface DONRenderer {
  load(manifest: DONManifest): Promise<void>;
  draw(frameKey: string): void;
  setSize(cssPixels: 32 | 48 | 64 | 96 | 256): void;
  pause(): void;
  destroy(): void;
}
```

Required behavior:

- internal logical canvas is `64 x 64`;
- canvas or image output has transparent background;
- `imageSmoothingEnabled = false` for canvas;
- CSS uses pixel-preserving rendering;
- frame rectangles come from the manifest;
- no DOM layout property changes per frame;
- no forced synchronous layout;
- no frame is generated procedurally;
- renderer drawing is a pure visual side effect.

## 5. Manifest strategy

The production manifest is the single timing source.

Required top-level fields:

```text
motionSystemVersion
characterVersion
logicalFrameSize
atlas
palette
frames
sequences
states
transitions
microActions
reducedMotion
checksums
```

Every sequence includes:

```text
name
hostState or semanticState
ordered frame keys
per-frame durations
loop flag
lock scope
interrupt policy
return state policy
cooldown
reduced-motion frame
optional prop requirement
```

Product bundles must not duplicate durations in component code.

## 6. Sprite loading strategy

### Base assets

The first motion package should preserve the target 8 x 8 atlas:

- logical atlas: `512 x 512`;
- maximum unique frames: `64`;
- decoded RGBA memory: `1,048,576 bytes`;
- versioned immutable URL;
- transparent PNG master;
- optional lossless WebP derivative only after pixel and alpha validation.

### Loading order

1. Render a static approved Idle poster frame already available with the surface.
2. Load the compact motion manifest when DON enters or approaches the viewport.
3. Load the base atlas for Idle, Blink, Listening, and Hover.
4. Decode the atlas with `HTMLImageElement.decode()` or platform equivalent before switching from the poster.
5. Load work-state frames when chat opens or a task begins.
6. Load rare Celebrate and optional Z frames during idle time only when the platform profile allows it.

The poster remains valid if motion assets fail.

### Request budget

Preferred production layout:

- one manifest request;
- one base atlas request;
- at most one optional extension atlas request.

Do not request individual frames.

## 7. Lazy loading

Trigger motion loading only when one of these becomes true:

- DON is within `256 px` of the viewport;
- the DON control receives keyboard focus;
- the user opens chat;
- a product task explicitly requests a DON state.

Use an intersection observer or native visibility primitive. Do not poll layout.

Idle-time preloading:

- schedule with `requestIdleCallback` when available;
- provide a `1500 ms` timeout fallback;
- cancel when the document hides;
- never delay page interactivity or critical content;
- do not preload optional mobile effects on cellular data-saving profiles.

## 8. Scheduler strategy

Use chained one-shot timers derived from manifest durations.

Do not use a permanent `requestAnimationFrame` loop. DON changes frames infrequently and does not need a 60 Hz heartbeat.

Timer behavior:

- schedule one next frame only;
- store every timer handle;
- clear timers on pause, state exit, reduced-motion change, visibility change, and destroy;
- when a delayed timer wakes late, draw the next frame only and continue from the new time;
- never fast-forward through multiple sprite frames;
- use a monotonic clock for cooldowns;
- seed test randomization, not production randomization.

## 9. Reduced motion

When `prefers-reduced-motion: reduce` or the native platform equivalent is active:

| State/action | Reduced behavior |
|---|---|
| Idle | Completely still neutral frame |
| Blink | No automatic blink |
| Eye movement | No automatic glance |
| Hover | No jump; control hover/focus styling provides feedback |
| Thinking | Still approved Thinking frame |
| Typing | Still laptop-and-focus frame |
| Listening | Still Listening frame |
| Speaking | Still neutral Speaking frame |
| Sleep | Still closed-eye frame |
| Celebrate | Still restrained peak frame for `480 ms` |
| Success | Still happy-eye frame for `480 ms` |
| Working | Still laptop work frame |
| Wave | Still raised-arm frame for `480 ms` only when explicitly requested |

Rules:

- reduced motion is observed live;
- switching to reduced motion cancels the current sequence at a safe still frame;
- switching out does not replay missed motion;
- semantic state and accessible status remain unchanged;
- no opacity pulse or alternative animated effect replaces disabled motion.

## 10. Accessibility

DON's sprite is decorative when accompanying visible product status.

Recommended markup behavior:

- sprite canvas or image uses `aria-hidden="true"`;
- the interactive DON control has a visible label or accessible name;
- the character never receives focus separately from its actual control;
- task state is conveyed through text and, when appropriate, an independent live region;
- live-region politeness is `polite` for completion and recoverable status;
- animation is never the sole error, progress, success, or notification signal;
- focus is never moved because an animation starts;
- hover motion is also reachable through keyboard focus eligibility;
- no repeated live announcement accompanies idle motion;
- no audio is required for any state.

Forced-colors and high-contrast modes:

- keep critical control borders and labels in normal UI layers;
- do not rely on the white body, dark face, or cyan eyes for control state;
- the sprite may remain unchanged because it is not the only information carrier.

## 11. Desktop behavior

- Hover and focus run the same locked sequence.
- Pointer movement inside the same hit target does not retrigger Hover.
- Scrolling suppresses idle micro-actions for `750 ms` after the last scroll event.
- Keyboard input suppresses idle micro-actions until `1200 ms` after the last key event.
- Dragging suppresses every automatic micro-action.
- Chat open owns the character state; page-level Hover is ignored while chat is open.
- Multiple visible DON instances use one motion coordinator. Only the active instance animates automatically.

## 12. Mobile behavior

- No Hover state is generated from touch emulation.
- Tap or chat open requests Listening.
- Scroll never triggers state motion.
- Idle quiet windows are multiplied by `1.25`.
- optional Z particles remain disabled by default;
- app background pauses immediately;
- resume draws the current still frame and schedules a fresh quiet window;
- do not replay completion motion that occurred while backgrounded;
- haptic feedback is product-owned and is not part of the DON Motion System.

## 13. Performance budget

| Resource | Budget | Enforcement |
|---|---:|---|
| Unique sprite frames | `≤64` | Atlas build validation |
| Base atlas logical size | `512 x 512` | Build validation |
| Decoded base atlas | `≤1.0 MiB` | Width × height × 4 |
| Compressed base atlas | `≤250 KiB` target | CI artifact check |
| Manifest | `≤12 KiB gzip` | CI artifact check |
| Controller and scheduler | `≤4 KiB gzip` target | Bundle analysis |
| Additional network requests | `≤2` base, `≤1` optional | Runtime audit |
| Frame draw main-thread work | `<2 ms` p95 | Performance trace |
| Idle CPU while still | approximately `0%` | No permanent loop |
| Active average CPU | `<1%` on reference desktop | Performance trace |
| Layout shifts | `0` | Fixed canvas dimensions |
| Timers while hidden | `0` | Lifecycle test |

These are ceilings, not targets. A simpler implementation is preferred.

## 14. Event adapters

Product adapters translate real events into semantic requests.

```ts
adapter.on("page:load", () => don.handle("page:load"));
adapter.on("chat:open", () => don.request({ state: "Listening", reason: "chat-open" }));
adapter.on("request:submitted", () => don.request({ state: "Thinking", reason: "request" }));
adapter.on("generation:typing", () => don.request({ state: "Typing", reason: "generation" }));
adapter.on("task:working", () => don.request({ state: "Working", reason: "task" }));
adapter.on("output:streaming", () => don.request({ state: "Speaking", reason: "output" }));
adapter.on("task:complete", () => don.request({ state: "Success", reason: "confirmed-complete" }));
```

Adapters must not infer `task:complete` from a timer, animation end, optimistic UI, or network request start.

## 15. Failure behavior

If the atlas fails:

- keep the static poster;
- keep the DON control functional;
- report the asset error to observability without showing technical text to the user;
- do not retry more than once in the same session.

If the manifest fails:

- do not guess frame rectangles or durations;
- remain static;
- preserve semantic status through normal UI.

If a sequence key is missing:

- draw the state's declared reduced-motion frame;
- log the version mismatch;
- never fall back to a frame from another character version.

## 16. Observability

Allowed anonymous counters:

- motion package load success/failure;
- manifest/atlas version mismatch;
- missing sequence key;
- average decode duration;
- sequence cancellation count by lifecycle reason;
- reduced-motion profile activation;
- Hover suppression by cooldown.

Do not log:

- chat content;
- client data;
- operator data;
- cursor paths;
- raw interaction text;
- identity-linked motion histories.

Motion analytics must not be used to increase attention-seeking behavior.

## 17. Test strategy

### Unit tests

- state routing;
- priority and queue coalescing;
- randomized range bounds;
- nonidentical consecutive blink timing tuples;
- Hover three-apex invariant;
- Hover lock, exit, and cooldown;
- timer cleanup;
- laptop state permissions;
- reduced-motion mapping;
- manifest schema and checksums.

### Visual tests

- every frame on dark and light surfaces;
- 32, 48, 64, 96, and 256 px rendering;
- transparent borders;
- no smoothing;
- canonical feet across every sequence;
- front, side, and back baseline consistency;
- transition first and final frames;
- silhouette stability.

### Runtime tests

- page visibility pause/resume;
- offscreen pause;
- keyboard and pointer Hover equivalence;
- mobile no-hover behavior;
- multiple-instance coordination;
- asset failure fallback;
- performance budgets on reference desktop and mobile hardware.

## 18. Integration gate

This guide does not authorize website or workspace integration.

Integration begins only after:

1. the full v1.2 production sprite library is rebuilt and approved;
2. the atlas and manifest pass checksum validation;
3. motion tests pass;
4. accessibility review passes;
5. performance budgets pass;
6. product-specific event adapters receive explicit approval;
7. a separate release plan defines rollback and observability.
