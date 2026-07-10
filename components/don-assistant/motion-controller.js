const INTERACTIVE_STATES = new Set(["idle", "awake", "hover", "expanded"]);

export class DONAssistantMotionController {
  constructor({
    machine,
    character,
    reducedMotion = false,
    random = Math.random,
    schedule = globalThis.setTimeout?.bind(globalThis),
    cancel = globalThis.clearTimeout?.bind(globalThis)
  }) {
    this.machine = machine;
    this.character = character;
    this.reducedMotion = Boolean(reducedMotion);
    this.random = random;
    this.schedule = schedule;
    this.cancel = cancel;
    this.isJumping = false;
    this.isCelebrating = false;
    this.blinkTimer = null;
    this.stateTimer = null;
    this.destroyed = false;
    this.handleAnimationEnd = this.handleAnimationEnd.bind(this);
    this.character?.addEventListener?.("animationend", this.handleAnimationEnd);
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
    if (this.reducedMotion) {
      this.character?.classList?.remove("is-triple-jumping", "is-celebrating", "is-blinking", "is-slow-blink");
      this.isJumping = false;
      this.isCelebrating = false;
      if (["blink", "triple_jump", "success"].includes(this.machine.state)) {
        this.machine.transition("idle", { source: "reduced-motion" });
      }
    }
    this.scheduleNextBlink();
  }

  triggerTripleJump(source = "pointer") {
    if (this.isJumping || this.isCelebrating) return false;

    if (this.reducedMotion) {
      this.machine.transition("hover", { source, reducedMotion: true });
      this.scheduleStateReset(0);
      return true;
    }

    this.isJumping = true;
    this.clearBlinkTimer();
    this.character?.classList?.remove("is-blinking", "is-slow-blink");
    this.character?.classList?.add("is-triple-jumping");
    this.machine.transition("triple_jump", { source });
    return true;
  }

  triggerSuccess(source = "event") {
    if (this.isCelebrating || this.isJumping) return false;

    this.machine.transition("success", { source, explicit: true });

    if (this.reducedMotion) {
      this.scheduleStateReset(0);
      return true;
    }

    this.isCelebrating = true;
    this.clearBlinkTimer();
    this.character?.classList?.add("is-celebrating");
    return true;
  }

  scheduleNextBlink() {
    this.clearBlinkTimer();
    if (this.destroyed || this.reducedMotion || typeof this.schedule !== "function") return;

    const delay = 2800 + Math.floor(this.random() * 4400);
    this.blinkTimer = this.schedule(() => this.blink(), delay);
  }

  blink() {
    if (this.destroyed || this.reducedMotion || this.isJumping || this.isCelebrating || !INTERACTIVE_STATES.has(this.machine.state)) {
      this.scheduleNextBlink();
      return false;
    }

    const slow = this.random() > 0.82;
    this.character?.classList?.toggle("is-slow-blink", slow);
    this.character?.classList?.add("is-blinking");
    this.machine.transition("blink", { slow });

    this.stateTimer = this.schedule(() => {
      this.character?.classList?.remove("is-blinking", "is-slow-blink");
      if (this.machine.state === "blink") this.machine.transition("idle", { source: "blink-complete" });
      this.scheduleNextBlink();
    }, slow ? 430 : 220);

    return true;
  }

  handleAnimationEnd(event) {
    if (event?.animationName === "don-triple-jump") {
      this.character?.classList?.remove("is-triple-jumping");
      this.isJumping = false;
      this.machine.transition("idle", { source: "triple-jump-complete" });
      this.scheduleNextBlink();
    }

    if (event?.animationName === "don-success") {
      this.character?.classList?.remove("is-celebrating");
      this.isCelebrating = false;
      this.machine.transition("idle", { source: "success-complete" });
      this.scheduleNextBlink();
    }
  }

  scheduleStateReset(delay = 250) {
    if (typeof this.schedule !== "function") return;
    if (this.stateTimer && this.cancel) this.cancel(this.stateTimer);
    this.stateTimer = this.schedule(() => {
      if (["hover", "success"].includes(this.machine.state)) {
        this.machine.transition("idle", { source: "state-reset" });
      }
    }, delay);
  }

  clearBlinkTimer() {
    if (this.blinkTimer && this.cancel) this.cancel(this.blinkTimer);
    this.blinkTimer = null;
  }

  destroy() {
    this.destroyed = true;
    this.clearBlinkTimer();
    if (this.stateTimer && this.cancel) this.cancel(this.stateTimer);
    this.character?.removeEventListener?.("animationend", this.handleAnimationEnd);
  }
}
