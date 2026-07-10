import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { DON_ASSISTANT_STATES, DONAssistantStateMachine } from "../components/don-assistant/state-machine.js";
import { DONAssistantMotionController } from "../components/don-assistant/motion-controller.js";

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    if (force === true) this.values.add(value);
    else if (force === false) this.values.delete(value);
    else if (this.values.has(value)) this.values.delete(value);
    else this.values.add(value);
  }
}

class FakeCharacter extends EventTarget {
  constructor() {
    super();
    this.classList = new FakeClassList();
  }
}

function createMotion({ reducedMotion = false, random = () => 0.5 } = {}) {
  const machine = new DONAssistantStateMachine();
  const character = new FakeCharacter();
  const queue = [];
  const schedule = (callback, delay) => {
    const job = { callback, delay, id: queue.length + 1 };
    queue.push(job);
    return job.id;
  };
  const cancel = (id) => {
    const job = queue.find((candidate) => candidate.id === id);
    if (job) job.cancelled = true;
  };
  const motion = new DONAssistantMotionController({ machine, character, reducedMotion, random, schedule, cancel });
  return { machine, character, motion, queue };
}

test("state machine exposes every required visual state", () => {
  assert.deepEqual(DON_ASSISTANT_STATES, [
    "idle", "blink", "sleep", "awake", "hover", "triple_jump",
    "listening", "thinking", "speaking", "success", "collapsed", "expanded"
  ]);
  const machine = new DONAssistantStateMachine();
  for (const state of DON_ASSISTANT_STATES) machine.transition(state);
  assert.equal(machine.state, "expanded");
  assert.throws(() => machine.transition("unknown"), /Unknown DON Assistant state/);
});

test("hover starts one triple-jump sequence and returns to idle", () => {
  const { machine, character, motion } = createMotion();
  assert.equal(motion.triggerTripleJump("pointer"), true);
  assert.equal(machine.state, "triple_jump");
  assert.equal(character.classList.contains("is-triple-jumping"), true);

  const complete = new Event("animationend");
  Object.defineProperty(complete, "animationName", { value: "don-triple-jump" });
  character.dispatchEvent(complete);

  assert.equal(machine.state, "idle");
  assert.equal(character.classList.contains("is-triple-jumping"), false);
});

test("repeated hover cannot stack the triple-jump animation", () => {
  const { motion, character } = createMotion();
  assert.equal(motion.triggerTripleJump("pointer"), true);
  assert.equal(motion.triggerTripleJump("pointer"), false);
  assert.equal([...character.classList.values].filter((value) => value === "is-triple-jumping").length, 1);
});

test("blink scheduling is varied and blinking is blocked while jumping", () => {
  const randomValues = [0, 0.99];
  const { motion, queue } = createMotion({ random: () => randomValues.shift() ?? 0.5 });
  motion.scheduleNextBlink();
  const firstDelay = queue.at(-1).delay;
  queue.at(-1).callback();
  const blinkReset = queue.at(-1);
  blinkReset.callback();
  const secondDelay = queue.at(-1).delay;
  assert.notEqual(firstDelay, secondDelay);

  motion.triggerTripleJump();
  assert.equal(motion.blink(), false);
});

test("reduced motion keeps interaction functional without animation classes", () => {
  const { machine, character, motion, queue } = createMotion({ reducedMotion: true });
  assert.equal(motion.triggerTripleJump("keyboard-focus"), true);
  assert.equal(machine.state, "hover");
  assert.equal(character.classList.contains("is-triple-jumping"), false);
  queue.at(-1).callback();
  assert.equal(machine.state, "idle");
});

test("success motion only starts after an explicit trigger", () => {
  const { machine, character, motion } = createMotion();
  assert.equal(machine.state, "idle");
  assert.equal(character.classList.contains("is-celebrating"), false);
  assert.equal(motion.triggerSuccess("completion-event"), true);
  assert.equal(machine.state, "success");
  assert.equal(character.classList.contains("is-celebrating"), true);
});

test("CSS defines exactly three jump peaks and mobile safe-area placement", async () => {
  const css = await fs.readFile(new URL("../components/don-assistant/styles.css", import.meta.url), "utf8");
  const keyframe = css.match(/@keyframes don-triple-jump\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  const peaks = [...keyframe.matchAll(/translateY\(-(?:13|11|9)px\)/g)];
  assert.equal(peaks.length, 3);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /contain: layout paint style/);
});

test("protected lab is noindex, local-only deterministic, and covers every state", async () => {
  const html = await fs.readFile(new URL("../labs/don-assistant/index.html", import.meta.url), "utf8");
  const script = await fs.readFile(new URL("../labs/don-assistant/lab.js", import.meta.url), "utf8");
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.match(script, /\/api\/hq-session/);
  assert.doesNotMatch(html, /plausible|track-event|platform-events/i);
  for (const state of DON_ASSISTANT_STATES) assert.match(html, new RegExp(`data-state="${state}"`));
  assert.match(html, /No LLM connected/);
  assert.match(html, /No visitor data/);
});

test("existing public forms and homepage stay outside the assistant diff", async () => {
  const home = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(home, /id="intakeForm"/);
  assert.match(home, /doneovernight-footer-watermark/);
  assert.match(home, /assets\/doneovernight-footer\.css/);
  assert.doesNotMatch(home, /components\/don-assistant/);
});
