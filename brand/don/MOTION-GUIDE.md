# DON Motion Guide

Version: `1.0.0-spec`

> Historical status: Phase 1 design reference. The approved runtime motion authority is [`MOTION-BIBLE-v1.0.md`](MOTION-BIBLE-v1.0.md), together with [`STATE-MACHINE.md`](STATE-MACHINE.md), [`ANIMATION-TIMINGS.md`](ANIMATION-TIMINGS.md), and [`IMPLEMENTATION-GUIDE.md`](IMPLEMENTATION-GUIDE.md). When timing, transition, state, cooldown, reduced-motion, or implementation rules differ, the DON Motion System v1.0 documents govern. DON v1.2 visual construction remains locked.

## 1. Motion character

DON is nearly still.

Motion communicates state. It is not decoration, entertainment, or a demand for attention.

Principles:

1. Hold longer than expected.
2. Move fewer pixels than expected.
3. Finish every action cleanly.
4. Never stack motion.
5. Return to a stable semantic state.
6. Disable nonessential movement when reduced motion is requested.

## 2. Global animation rules

- Logical canvas: `32 x 32`.
- All displacement uses integer logical pixels.
- Variable frame timing is required; do not normalize animations to a fixed FPS.
- Use frame holds to create calmness.
- Only one body-level animation may run at a time.
- Eye movement may run only when body motion is idle and the current state permits it.
- Blink is blocked during Hover, Celebrate, Wave, Success, state entry, and state exit.
- Typing and Working own the laptop prop; all other states remove it.
- A state transition must complete or be explicitly cancelled before another transition starts.
- Offscreen and hidden instances pause.

## 3. State priority

From highest to lowest:

1. Success
2. Celebrate
3. Hover
4. Wave
5. Typing / Working
6. Listening / Thinking
7. Sleep
8. Look Left / Look Right
9. Blink
10. Idle

A lower-priority animation cannot interrupt a higher-priority animation.

## 4. Frame and timing specification

### Idle

Purpose: available without asking for attention.

| Frame | Duration | Pose |
|---:|---:|---|
| `00` | `4800 ms` | Completely still |
| `01` | `320 ms` | One-pixel inhale preparation |
| `02` | `240 ms` | Peak breath; upper body expands by 1 px |
| `03` | `480 ms` | Exhale to neutral |
| `04` | `560 ms` | Settle and hold |

Total: `6400 ms`.

Rules:

- No floating.
- No side-to-side sway.
- Feet remain fixed.
- Face remains fixed.
- Breathing changes the upper silhouette by at most 1 logical px.
- Do not add a separate constant idle loop on top of this cycle.

### Blink

Purpose: natural life signal.

| Frame | Duration | Eyes |
|---:|---:|---|
| `00` | `70 ms` | Open |
| `01` | `55 ms` | Half closed |
| `02` | `70 ms` | Closed `3 x 1` |
| `03` | `40 ms` | Open |

Normal total: `235 ms`.

Scheduling:

- Random delay between `3800 ms` and `7600 ms`.
- Delay is sampled again after every blink.
- Never use a fixed interval.
- One slow blink is permitted approximately once every 8 blinks.
- Slow-blink total: `360 ms` using `105 / 75 / 105 / 75 ms`.
- Do not blink while jumping, celebrating, waving, entering sleep, exiting sleep, or changing work state.

### Sleep

Purpose: communicate extended inactivity without looking powered off.

| Frame | Duration | Pose |
|---:|---:|---|
| `00` | `3000 ms` | Closed eyes, neutral low posture |
| `01` | `480 ms` | Slow inhale, upper body +1 px |
| `02` | `840 ms` | Hold |
| `03` | `480 ms` | Exhale to low posture |

Total: `4800 ms`, loop.

Rules:

- Eyes remain closed.
- Feet remain fixed.
- Body sits 1 px lower than Idle.
- No `Z` symbols.
- No snoring motion.
- No head nod.

### Thinking

Purpose: communicate real processing.

Entry:

- 4 frames.
- `180 / 180 / 180 / 360 ms`.
- Eyes move up by 1 px, then hold.

Hold:

- Remain still for as long as processing continues.
- Optional eye micro-cycle may run once every `2800-4200 ms`.
- Micro-cycle moves both eyes 1 px toward center and back.
- No orbiting dots, spinner, pulsing head, or continuous body motion.

Exit: `240 ms` to the next semantic state.

### Listening

Purpose: show readiness for input.

| Frame | Duration | Pose |
|---:|---:|---|
| `00` | `180 ms` | Eyes begin widening |
| `01` | `240 ms` | Eyes at `3 x 3` |
| `02` | `180 ms` | Eyes return to neutral |

After entry, hold a still neutral Listening frame.

No cyan pulse, ear icon, sound wave, microphone, or repeated head movement.

### Typing

Purpose: communicate active text production.

- Laptop prop required.
- 6-frame hand cycle.
- Frame durations: `90 / 90 / 90 / 90 / 90 / 90 ms`.
- Cycle duration: `540 ms`.
- Random pause after each cycle: `420-900 ms`.
- Hands alternate by 1 px.
- Eyes use the Focused Work expression.
- Body and feet remain fixed.
- Blink may occur only during the random pause.

Typing is not a permanent loop without pauses.

### Working

Purpose: communicate execution beyond typing.

- Laptop prop required.
- 4-frame cycle: `160 / 160 / 480 / 1000 ms`.
- Eyes move between screen center and lower-left by 1 px.
- One hand may move by 1 px once per cycle.
- Body stays fixed.
- Blink delay while Working: random `5000-9000 ms`.
- No loading spinner or progress implication unless a real progress value exists elsewhere in the interface.

### Hover - exactly three jumps

Purpose: acknowledge direct pointer hover or keyboard focus.

This is one locked 8-frame sequence.

| Frame | Duration | Vertical offset | Pose |
|---:|---:|---:|---|
| `00` | `80 ms` | `0 px` | Pre-compress |
| `01` | `110 ms` | `-6 px` | Jump 1 apex |
| `02` | `100 ms` | `0 px` | Land 1 |
| `03` | `100 ms` | `-5 px` | Jump 2 apex |
| `04` | `100 ms` | `0 px` | Land 2 |
| `05` | `100 ms` | `-4 px` | Jump 3 apex |
| `06` | `110 ms` | `0 px` | Land 3 |
| `07` | `140 ms` | `0 px` | Settle to Idle |

Total: `840 ms`.

Rules:

- Exactly three upward peaks.
- Heights descend `6 / 5 / 4 px`.
- Feet remain proportional in every frame.
- Contact shadow may contract but not disappear.
- Repeated hover, focus, or activation while locked is ignored.
- The sequence does not restart from the current frame.
- The lock clears only after frame `07` completes.
- Hover cannot retrigger until pointer or focus fully exits and enters again.
- Return to Idle or the pre-hover semantic state.

### Celebrate

Purpose: rare major completion.

- 6 frames.
- `80 / 100 / 100 / 100 / 120 / 180 ms`.
- Total: `680 ms`.
- One 1 px body lift.
- Arms rise no more than 4 px beyond the neutral envelope.
- Eyes use the Success expression.
- No particles, rays, marks, confetti, or color effects.
- No repeated bounce.
- Runs once, then returns to Idle.

Celebrate is reserved for major milestones, not ordinary button success.

### Wave

Purpose: deliberate greeting or sign-off.

- 6 frames.
- `100 / 120 / 120 / 120 / 120 / 140 ms`.
- Total: `720 ms`.
- One arm performs exactly two arcs.
- Arm endpoint moves no more than 3 px between adjacent frames.
- Body does not bounce or rotate.
- Runs once, then returns to the prior calm state.

### Looking Left / Looking Right

Purpose: directional attention.

- 3 frames.
- `120 ms` enter.
- Hold between `480-1200 ms` according to context.
- `120 ms` return.
- Both eyes translate together by exactly 1 px.
- Head and body do not rotate in the front view.
- Never alternate left/right continuously.

### Success

Purpose: confirm a completed action.

- 4 frames.
- `80 / 100 / 120 / 180 ms`.
- Total: `480 ms`.
- Eyes transition to the Success expression.
- No body jump.
- No external visual effect.
- No sound requirement.
- Runs only after an explicit success event.
- Returns to Idle or the correct product state.

## 5. State transitions

- Idle to Listening: `180 ms`.
- Listening to Thinking: `240 ms`.
- Thinking to Typing/Working: `240 ms`; laptop appears within the same transition.
- Typing to Working: `180 ms`.
- Working to Success: `240 ms`; laptop disappears before Success frame `01`.
- Success to Idle: included in the 480 ms Success sequence.
- Idle to Sleep: `600 ms`.
- Sleep to Idle: `420 ms`; eyes reopen after posture returns.

No crossfade between sprites. Use authored transition frames or a direct semantic cut when reduced motion is active.

## 6. Reduced-motion behavior

When `prefers-reduced-motion: reduce` is active:

- Idle uses the completely still `00` frame.
- Hover does not jump; use a still attentive frame for `240 ms`.
- Celebrate uses the Success eye frame with no body motion.
- Wave uses one raised-arm frame with no arc.
- Sleep remains still with closed eyes.
- Thinking, Listening, Typing, and Working use their first meaningful still frame.
- Looking states may move the eyes directly with no transition.
- Success uses the final confirmed frame for `320 ms`.
- All functionality remains available.

## 7. Motion quality checklist

- no fixed blink interval;
- no constant floating;
- no stacked hover sequence;
- exactly three jumps;
- correct logical-pixel offsets;
- feet remain consistent;
- transition returns cleanly;
- celebration is subtle and explicit;
- typing includes pauses;
- laptop appears only in Typing and Working;
- offscreen instances pause;
- reduced-motion alternative is defined.
