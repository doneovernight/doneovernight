export class DONAssistantAccessibilityController {
  constructor({ characterButton, bubbleButton, motion, bubble }) {
    this.characterButton = characterButton;
    this.bubbleButton = bubbleButton;
    this.motion = motion;
    this.bubble = bubble;
    this.abortController = new AbortController();
  }

  connect() {
    const { signal } = this.abortController;

    this.characterButton.addEventListener("mouseenter", () => this.motion.triggerTripleJump("pointer"), { signal });
    this.characterButton.addEventListener("focus", () => this.motion.triggerTripleJump("keyboard-focus"), { signal });
    this.characterButton.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.motion.triggerTripleJump("keyboard-activation");
    }, { signal });

    this.bubbleButton.addEventListener("click", () => this.bubble.toggle(), { signal });
  }

  destroy() {
    this.abortController.abort();
  }
}
