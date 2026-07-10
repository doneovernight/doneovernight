export const DON_ASSISTANT_STATES = Object.freeze([
  "idle",
  "blink",
  "sleep",
  "awake",
  "hover",
  "triple_jump",
  "listening",
  "thinking",
  "speaking",
  "success",
  "collapsed",
  "expanded"
]);

export class DONAssistantStateMachine {
  constructor(initialState = "idle") {
    if (!DON_ASSISTANT_STATES.includes(initialState)) {
      throw new TypeError(`Unknown DON Assistant state: ${initialState}`);
    }

    this.state = initialState;
    this.previousState = null;
    this.listeners = new Set();
  }

  transition(nextState, metadata = {}) {
    if (!DON_ASSISTANT_STATES.includes(nextState)) {
      throw new TypeError(`Unknown DON Assistant state: ${nextState}`);
    }

    if (nextState === this.state && !metadata.force) return false;

    const previousState = this.state;
    this.previousState = previousState;
    this.state = nextState;

    const change = Object.freeze({
      state: nextState,
      previousState,
      metadata: Object.freeze({ ...metadata })
    });

    this.listeners.forEach((listener) => listener(change));
    return true;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("State listeners must be functions.");
    }

    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
