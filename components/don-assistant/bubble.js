export const DON_ASSISTANT_MESSAGES = Object.freeze([
  "Looking for something specific?",
  "Want to see how the system works?",
  "Tell me what your business needs.",
  "Your next step is ready."
]);

export class DONAssistantBubble {
  constructor({ machine, bubble, button, message }) {
    this.machine = machine;
    this.bubble = bubble;
    this.button = button;
    this.message = message;
    this.expanded = true;
  }

  setMessage(nextMessage) {
    const safeMessage = DON_ASSISTANT_MESSAGES.includes(nextMessage)
      ? nextMessage
      : DON_ASSISTANT_MESSAGES[0];
    this.message.textContent = safeMessage;
  }

  setExpanded(expanded, source = "control") {
    this.expanded = Boolean(expanded);
    this.bubble.dataset.expanded = String(this.expanded);
    this.button.setAttribute("aria-expanded", String(this.expanded));
    this.button.setAttribute("aria-label", this.expanded ? "Collapse assistant message" : "Expand assistant message");
    this.machine.transition(this.expanded ? "expanded" : "collapsed", { source });
  }

  toggle() {
    this.setExpanded(!this.expanded, "bubble-toggle");
  }
}
