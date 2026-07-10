# DON Motion System v1.0 — Pseudo Implementation

This is a behavioral reference, not website integration code.

```ts
type State =
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

type Snapshot = {
  current: State;
  previous: State;
  bodyLocked: boolean;
  visible: boolean;
  documentActive: boolean;
  reducedMotion: boolean;
  hoverCooldownUntil: number;
  hoverExitObserved: boolean;
};

class DONMotion {
  snapshot: Snapshot = initialSnapshot();
  queuedRequest: MotionRequest | null = null;
  transitionToken = 0;
  timers = new Set<number>();

  async request(next: MotionRequest) {
    if (!this.canAnimate()) {
      this.commit(next.state);
      renderer.draw(reducedFrameFor(next.state));
      return;
    }

    if (!stateRequestAllowed(this.snapshot, next)) return;

    if (this.snapshot.bodyLocked) {
      this.queuedRequest = highestPriority(this.queuedRequest, next);
      return;
    }

    this.cancelMicroAction();
    const route = transitionRoute(this.snapshot.current, next.state);
    const token = ++this.transitionToken;

    for (const transition of route) {
      if (token !== this.transitionToken) return;
      await this.play(transition.sequence, token);
    }

    this.commit(next.state);
    this.scheduleMicroAction();
  }

  async play(sequenceName: string, token = this.transitionToken) {
    const sequence = manifest.sequences[sequenceName];
    this.snapshot.bodyLocked = sequence.lock === "body";

    for (let i = 0; i < sequence.frames.length; i += 1) {
      if (token !== this.transitionToken || !this.canAnimate()) break;
      renderer.draw(sequence.frames[i]);
      await this.wait(sequence.durationsMs[i]);
    }

    this.snapshot.bodyLocked = false;
    this.applyCooldown(sequence);
    this.flushQueue();
  }

  onHoverEnter() {
    if (
      this.snapshot.current !== "Idle" ||
      this.snapshot.bodyLocked ||
      !this.snapshot.hoverExitObserved ||
      now() < this.snapshot.hoverCooldownUntil ||
      this.snapshot.reducedMotion
    ) return;

    this.snapshot.hoverExitObserved = false;
    this.request({ state: "Hover", priority: 70, returnState: "Idle" });
  }

  onHoverExit() {
    this.snapshot.hoverExitObserved = true;
  }

  scheduleMicroAction() {
    if (!microActionAllowed(this.snapshot)) return;

    const delay = sampleQuietWindow(this.snapshot.current);
    this.setTimer(() => {
      if (!microActionAllowed(this.snapshot)) return;
      const action = weightedMicroActionOrStill();
      if (action) this.play(action.sequence);
      else this.scheduleMicroAction();
    }, delay);
  }

  pause(reason: string) {
    this.transitionToken += 1;
    this.clearTimers();
    this.snapshot.bodyLocked = false;
    renderer.draw(reducedFrameFor(this.snapshot.current));
  }

  destroy() {
    this.pause("destroy");
    this.queuedRequest = null;
    observers.disconnect();
    renderer.destroy();
  }
}
```

## Event adapter reference

```ts
events.on("page:load", () => don.request(idleRequest("page-load")));
events.on("chat:open", () => don.request(stateRequest("Listening", 30)));
events.on("request:submitted", () => don.request(stateRequest("Thinking", 40)));
events.on("generation:typing", () => don.request(stateRequest("Typing", 60)));
events.on("task:working", () => don.request(stateRequest("Working", 60)));
events.on("output:streaming", () => don.request(stateRequest("Speaking", 50)));
events.on("task:complete", () => don.request(stateRequest("Success", 80)));
events.on("milestone:major", () => don.request(stateRequest("Celebrate", 90)));
events.on("page:change", () => don.pause("navigation"));
```

Product events must report confirmed truth. The motion engine never infers task completion.

## Timer requirements

- one scheduled frame timer at a time;
- one optional micro-action timer;
- timer handles stored and cleared;
- monotonic time for cooldowns;
- no permanent animation frame loop;
- no fast-forward after hidden-tab delays;
- seeded random source in tests only.
