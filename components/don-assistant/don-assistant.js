import { DONAssistantStateMachine } from "./state-machine.js";
import { DONAssistantMotionController } from "./motion-controller.js";
import { DONAssistantAccessibilityController } from "./accessibility-controller.js";
import { DONAssistantBubble, DON_ASSISTANT_MESSAGES } from "./bubble.js";

const template = `
  <section class="don-assistant" data-state="idle" aria-label="DON, the DONEOVERNIGHT guide">
    <div class="don-assistant__bubble" data-expanded="true">
      <span class="don-assistant__status" aria-hidden="true"></span>
      <p class="don-assistant__message" aria-live="polite">${DON_ASSISTANT_MESSAGES[0]}</p>
      <button class="don-assistant__bubble-toggle" type="button" aria-expanded="true" aria-label="Collapse assistant message">
        <span aria-hidden="true">−</span>
      </button>
    </div>
    <div class="don-assistant__character-wrap">
      <div class="don-assistant__signal" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="don-assistant__character" tabindex="0" role="button" aria-label="Animate DON with three small jumps">
        <span class="don-assistant__shadow" aria-hidden="true"></span>
        <span class="don-assistant__body" aria-hidden="true">
          <span class="don-assistant__hood">
            <span class="don-assistant__visor">
              <span class="don-assistant__gaze"></span>
            </span>
          </span>
          <span class="don-assistant__collar"></span>
          <span class="don-assistant__mark"></span>
          <span class="don-assistant__arm don-assistant__arm--left"></span>
          <span class="don-assistant__arm don-assistant__arm--right"></span>
          <span class="don-assistant__foot don-assistant__foot--left"></span>
          <span class="don-assistant__foot don-assistant__foot--right"></span>
        </span>
      </div>
      <span class="don-assistant__name" aria-hidden="true">DON / 01</span>
    </div>
  </section>
`;

export class DONAssistant {
  constructor(target, options = {}) {
    if (!(target instanceof Element)) {
      throw new TypeError("DONAssistant requires a DOM element target.");
    }

    target.innerHTML = template;
    this.target = target;
    this.root = target.querySelector(".don-assistant");
    this.character = target.querySelector(".don-assistant__character");
    this.bubbleElement = target.querySelector(".don-assistant__bubble");
    this.bubbleButton = target.querySelector(".don-assistant__bubble-toggle");
    this.messageElement = target.querySelector(".don-assistant__message");
    this.machine = new DONAssistantStateMachine(options.initialState || "idle");
    this.mediaQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
    this.reducedMotionOverride = options.reducedMotion;

    this.motion = new DONAssistantMotionController({
      machine: this.machine,
      character: this.character,
      reducedMotion: this.prefersReducedMotion()
    });
    this.bubble = new DONAssistantBubble({
      machine: this.machine,
      bubble: this.bubbleElement,
      button: this.bubbleButton,
      message: this.messageElement
    });
    this.accessibility = new DONAssistantAccessibilityController({
      characterButton: this.character,
      bubbleButton: this.bubbleButton,
      motion: this.motion,
      bubble: this.bubble
    });

    this.unsubscribe = this.machine.subscribe(({ state }) => {
      this.root.dataset.state = state;
      this.root.setAttribute("aria-label", `DON, the DONEOVERNIGHT guide. Current state: ${state.replaceAll("_", " ")}.`);
    });

    this.handlePreferenceChange = () => {
      if (this.reducedMotionOverride === undefined) {
        this.motion.setReducedMotion(this.prefersReducedMotion());
      }
    };
    this.mediaQuery?.addEventListener?.("change", this.handlePreferenceChange);

    this.handleSuccessEvent = () => this.success("external-event");
    globalThis.addEventListener?.("donassistant:success", this.handleSuccessEvent);
    this.accessibility.connect();
    this.bubble.setMessage(options.message || DON_ASSISTANT_MESSAGES[0]);
    this.root.dataset.state = this.machine.state;
    this.motion.scheduleNextBlink();
  }

  prefersReducedMotion() {
    if (this.reducedMotionOverride !== undefined) return Boolean(this.reducedMotionOverride);
    return Boolean(this.mediaQuery?.matches);
  }

  setState(state, metadata = { source: "control" }) {
    return this.machine.transition(state, metadata);
  }

  setMessage(message) {
    this.bubble.setMessage(message);
  }

  setExpanded(expanded) {
    this.bubble.setExpanded(expanded);
  }

  setReducedMotion(value) {
    this.reducedMotionOverride = Boolean(value);
    this.motion.setReducedMotion(value);
    this.root.dataset.reducedMotion = String(Boolean(value));
  }

  useSystemMotionPreference() {
    this.reducedMotionOverride = undefined;
    this.motion.setReducedMotion(this.prefersReducedMotion());
    delete this.root.dataset.reducedMotion;
  }

  jump(source = "control") {
    return this.motion.triggerTripleJump(source);
  }

  success(source = "control") {
    return this.motion.triggerSuccess(source);
  }

  destroy() {
    this.unsubscribe?.();
    this.motion.destroy();
    this.accessibility.destroy();
    this.mediaQuery?.removeEventListener?.("change", this.handlePreferenceChange);
    globalThis.removeEventListener?.("donassistant:success", this.handleSuccessEvent);
    this.target.innerHTML = "";
  }
}

export { DON_ASSISTANT_MESSAGES } from "./bubble.js";
export { DON_ASSISTANT_STATES } from "./state-machine.js";
