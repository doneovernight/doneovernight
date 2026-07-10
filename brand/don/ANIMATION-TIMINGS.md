# DON Animation Timings

Motion System version: `1.0.0`

Visual dependency: DON v1.2

Time unit: milliseconds

## 1. Timing model

DON uses variable frame durations. There is no fixed-FPS playback loop.

Each animation is an ordered list of authored sprite frame references and per-frame holds. Random values are sampled once when a sequence is scheduled and remain fixed for that playback.

Global timing rules:

- minimum authored frame hold: `40 ms`;
- minimum quiet gap after an automatic micro-action: `1200 ms`;
- maximum idle anatomy displacement: `1 logical px`;
- body one-shots never loop;
- frame time does not catch up after a hidden tab; playback pauses;
- a delayed timer advances at most one frame, never several frames at once;
- timing jitter affects holds only, never geometry or frame order.

## 2. Easing

Sprite animation uses authored frame timing, not interpolated body geometry.

| Purpose | Recommended curve | Use |
|---|---|---|
| Sprite frame switch | `steps(1, end)` | Any sprite-frame change |
| Calm settle | `cubic-bezier(0.22, 0.61, 0.36, 1)` | Optional container settle or panel entry |
| Jump rise | `cubic-bezier(0.33, 0, 0.20, 1)` | Timing reference for authored rise frames |
| Jump fall | `cubic-bezier(0.40, 0, 0.70, 1)` | Timing reference for authored fall frames |
| Small UI fade | `cubic-bezier(0.20, 0, 0, 1)` | Product chrome only, never sprite pixels |

Rules:

- Do not tween sprite scale, border radius, anatomy, or eye coordinates.
- Do not apply blur, opacity fades, spring physics, bounce libraries, or subpixel transforms to the sprite.
- Curves may guide the authored timing distribution. Actual sprite offsets remain whole logical pixels.

## 3. Idle breath

Idle is a scheduled one-shot micro-action, not a permanent loop.

Eligibility begins after `4000 ms` of stable visible Idle. After a breath completes, sample the next breath opportunity between `6500-12000 ms`. At that opportunity, run the breath with probability `55%`; otherwise remain still and reschedule.

| Frame | Duration | Geometry |
|---:|---:|---|
| `idle-00` | scheduler-owned quiet hold | Neutral still frame |
| `idle-01` | `180 ms` | Inhale preparation |
| `idle-02` | `220 ms` | Upper body +1 px |
| `idle-03` | `320 ms` | Peak hold, +1 px |
| `idle-04` | `260 ms` | Return to neutral |
| `idle-00` | `560 ms` | Stable recovery |

Motion event duration excluding quiet hold: `1540 ms`.

The scheduler must not align breaths to a fixed wall-clock interval.

## 4. Blink

Normal blink interval is sampled between `3800-8200 ms` after the previous blink or eye action completes.

| Frame | Normal duration | Slow duration | Eyes |
|---:|---:|---:|---|
| `blink-00` | `35-55 ms` | `100-140 ms` | Open staging frame |
| `blink-01` | `45-65 ms` | `80-110 ms` | Half closed |
| `blink-02` | `55-85 ms` | `120-170 ms` | Closed |
| `blink-03` | `45-65 ms` | `100-140 ms` | Open |

Normal duration range: `180-270 ms`.

Slow duration range: `400-560 ms`.

Slow-blink selection: once every randomized `9-14` eligible blinks.

To prevent identical consecutive blinks:

- sample every frame duration independently within its range;
- reject a duration tuple identical to the previous tuple;
- preserve the same approved frame order and eye geometry;
- never synthesize a double blink.

## 5. Eye movement

Eye movement is a three-frame micro-action: neutral, translated eyes, neutral.

| Action | Enter | Hold | Return | Maximum translation |
|---|---:|---:|---:|---:|
| Look left | `90-120 ms` | `220-700 ms` | `100-140 ms` | 1 px left |
| Look right | `90-120 ms` | `220-700 ms` | `100-140 ms` | 1 px right |
| Glance up | `80-110 ms` | `180-420 ms` | `100-140 ms` | 1 px up |
| Glance down | `80-110 ms` | `180-420 ms` | `100-140 ms` | 1 px down |

Rules:

- both eyes translate together;
- head and body remain still;
- no continuous scanning;
- no immediate left-right alternation;
- next blink is delayed at least `900 ms` after an eye action;
- directional glances are disabled during user text entry and scrolling.

## 6. Thinking

Thinking enters once and then holds.

| Frame | Duration | Pose |
|---:|---:|---|
| `thinking-00` | `120 ms` | Stable source frame |
| `thinking-01` | `140 ms` | Eyes shift up 1 px |
| `thinking-02` | `180 ms` | Head bias begins |
| `thinking-03` | `320 ms` | One-pixel tilt settles |
| `thinking-04` | semantic hold | Still Thinking frame |

Entry duration: `760 ms`.

During a hold longer than `3500 ms`, one eye micro-glance may occur after a randomized `3500-6000 ms` interval. It does not repeat more often than once per interval.

Laptop variant:

- laptop appears during a `260 ms` authored transition;
- eyes focus down after the laptop is fully visible;
- no typing-hand cycle runs until state changes to Typing;
- long execution changes to Working rather than looping Thinking.

## 7. Typing

Typing uses one six-frame hand pair followed by a randomized still pause.

| Frame | Duration | Pose |
|---:|---:|---|
| `typing-00` | `90 ms` | Hands ready, eyes down |
| `typing-01` | `100 ms` | Left hand +1 px |
| `typing-02` | `90 ms` | Center |
| `typing-03` | `110 ms` | Right hand +1 px |
| `typing-04` | `90 ms` | Center, body +1 px |
| `typing-05` | `140 ms` | Stable laptop frame |

Active pair: `620 ms`.

Pause after every pair: randomized `450-1100 ms`.

Rules:

- blink is allowed only during the pause;
- the next hand pair may be omitted when output is sparse;
- a pause longer than `900 ms` holds the stable laptop frame;
- exiting Typing waits for the pair to finish or uses the pause as a safe point.

## 8. Listening

Listening uses one subtle entry and then holds.

| Frame | Duration | Pose |
|---:|---:|---|
| `listening-00` | `140 ms` | Neutral source |
| `listening-01` | `180 ms` | One-pixel anticipation |
| `listening-02` | `260 ms` | Subtle head tilt |
| `listening-03` | `320 ms` | Settle to Listening hold |

Entry duration: `900 ms`.

No loop follows. A blink may run after `1200 ms` of stable Listening when input is not actively streaming.

## 9. Speaking

Speaking has no mouth motion. It uses a restrained eye cadence separated by long still holds.

| Frame | Duration | Eyes |
|---:|---:|---|
| `speaking-00` | `140 ms` | Neutral |
| `speaking-01` | `120 ms` | Softened by 1 px |
| `speaking-02` | `180 ms` | Return to neutral |
| `speaking-00` | `1400-2400 ms` | Still hold |

The cadence runs only while output is genuinely streaming or speech audio is active. It stops immediately at the next neutral hold when output ends.

## 10. Working

Working uses long holds and minimal laptop interaction.

| Frame | Duration | Pose |
|---:|---:|---|
| `working-00` | `180 ms` | Eyes at screen center |
| `working-01` | `220 ms` | Eyes lower-left by 1 px |
| `working-02` | `700 ms` | One hand moves 1 px |
| `working-03` | `1200 ms` | Stable hold |

Cycle duration: `2300 ms`.

After each cycle, select either another cycle or a still hold of `900-1800 ms`. Blink may occur only during a still hold.

## 11. Sleep

| Frame | Duration | Pose |
|---:|---:|---|
| `sleep-00` | `2400-3600 ms` | Closed eyes, still low posture |
| `sleep-01` | `420 ms` | Slow inhale, upper body +1 px |
| `sleep-02` | `780 ms` | Peak hold |
| `sleep-03` | `420 ms` | Exhale |
| `sleep-04` | `900 ms` | Stable low posture |

Cycle duration range: `4920-6120 ms`.

Optional Z particle:

- disabled by default;
- one particle only;
- three effect frames over `900-1200 ms`;
- randomized interval `8000-14000 ms`;
- never changes DON's body frame;
- disabled for reduced motion and mobile default profile.

## 12. Hover — exactly three jumps

Hover is one locked `1185 ms` sequence.

| Frame | Duration | Vertical offset | Phase |
|---:|---:|---:|---|
| `hover-00` | `60 ms` | `0 px` | Stable source |
| `hover-01` | `80 ms` | `0 px` | Anticipation, body compresses 1 px |
| `hover-02` | `70 ms` | `-3 px` | Jump 1 rise |
| `hover-03` | `80 ms` | `-7 px` | Jump 1 apex |
| `hover-04` | `80 ms` | `0 px` | Land 1 |
| `hover-05` | `65 ms` | `-3 px` | Jump 2 rise |
| `hover-06` | `75 ms` | `-6 px` | Jump 2 apex |
| `hover-04` | `80 ms` | `0 px` | Land 2, shared frame |
| `hover-07` | `65 ms` | `-2 px` | Jump 3 rise |
| `hover-08` | `75 ms` | `-5 px` | Jump 3 apex |
| `hover-09` | `65 ms` | `-2 px` | Final fall |
| `hover-10` | `90 ms` | `0 px` | Final land |
| `hover-11` | `120 ms` | `0 px` | Recovery |
| `idle-00` | `180 ms` | `0 px` | Stable return |

Invariants:

- exactly three apexes: `-7`, `-6`, `-5 px`;
- feet use the canonical v1.2 construction in every authored pose;
- anticipation changes posture, not foot shape;
- no animation stacking or restart;
- post-completion cooldown: `6000 ms`;
- pointer or focus must exit and re-enter after completion;
- reduced motion uses no jump.

## 13. Celebrate

Celebrate is a one-shot reserved for explicit major milestones.

| Frame | Duration | Pose |
|---:|---:|---|
| `celebrate-00` | `120 ms` | Stable source |
| `celebrate-01` | `140 ms` | Anticipation |
| `celebrate-02` | `180 ms` | Arms begin lift |
| `celebrate-03` | `220 ms` | One-pixel body lift |
| `celebrate-04` | `160 ms` | Peak restrained pose |
| `celebrate-05` | `180 ms` | Return begins |
| `celebrate-06` | `180 ms` | Land |
| `celebrate-07` | `260 ms` | Recovery hold |

Total: `1440 ms`.

Maximum allowed: `2000 ms`.

No loop, spin, confetti, body recolor, or repeated bounce.

## 14. Wave gesture

Wave is a locked gesture hosted by Idle or Listening. It is not a semantic state.

| Frame | Duration | Pose |
|---:|---:|---|
| `wave-00` | `110 ms` | Stable source |
| `wave-01` | `130 ms` | Arm raises |
| `wave-02` | `150 ms` | Small outward arc |
| `wave-03` | `150 ms` | Small inward arc |
| `wave-04` | `130 ms` | Arm lowers |
| `wave-05` | `220 ms` | Stable recovery |

Total: `890 ms`.

The hand endpoint moves no more than 3 logical pixels between adjacent frames. The torso and feet remain still.

## 15. Success

| Frame | Duration | Pose |
|---:|---:|---|
| `success-00` | `90 ms` | Stable source |
| `success-01` | `110 ms` | Eyes begin happy expression |
| `success-02` | `140 ms` | Body lifts 1 px |
| `success-03` | `120 ms` | Peak hold |
| `success-04` | `140 ms` | Return to ground |
| `success-05` | `240 ms` | Stable settle |

Total: `840 ms`.

Success runs once and returns to Idle or Listening according to product context. It does not automatically trigger Celebrate.

## 16. State transition durations

| Transition | Duration | Notes |
|---|---:|---|
| Idle → Listening | `220 ms` | Entry anticipation begins |
| Listening → Idle | `240 ms` | Calm settle |
| Listening → Thinking | `240 ms` | Eyes lead, head follows |
| Thinking → Typing | `260 ms` | Laptop appears before hands move |
| Thinking → Working | `260 ms` | Laptop appears, eyes lower |
| Thinking → Speaking | `220 ms` | Head returns before cadence |
| Typing → Speaking | `180 ms` | Finish hand pair, laptop leaves |
| Typing → Working | `180 ms` | Hold laptop, slow the hands |
| Working → Success | `240 ms` | Laptop leaves before happy eyes |
| Speaking → Idle | `240 ms` | Finish cadence at neutral eyes |
| Speaking → Listening | `180 ms` | One-pixel attentive tilt |
| Success → Idle | included in sequence | Recovery is `success-05` |
| Success → Listening | `220 ms` after settle | Chat remains open |
| Idle → Sleep | `650 ms` | Eyes close after posture lowers |
| Sleep → Idle | `480 ms` | Posture rises before eyes open |
| Safe state → Celebrate | `240 ms` | Explicit request only |
| Celebrate → Idle | `360 ms` | Includes final stable hold |

## 17. Sprite sequence contract

Canonical frame key:

```text
don-v12-{view}-{sequence}-{frame}
```

Example:

```text
don-v12-front-hover-03
```

Frame numbers are two-digit, zero-padded, and contain no duration.

Manifest sequence entry:

```json
{
  "name": "hover",
  "state": "Hover",
  "frames": ["don-v12-front-hover-00", "don-v12-front-hover-01"],
  "durationsMs": [60, 80],
  "loop": false,
  "lock": "body",
  "cooldownMs": 6000,
  "requiresExitBeforeReplay": true,
  "reducedMotionFrame": "don-v12-front-idle-00"
}
```

## 18. Unique-frame budget

Sequences reuse neutral, landing, recovery, face, and laptop frames. The target remains a single 8 x 8 atlas with no more than 64 unique 64 x 64 frames.

| Group | Referenced frames | Target unique frames |
|---|---:|---:|
| Views and stable poses | 4 | 4 |
| Idle | 6 | 4 |
| Blink | 4 | 3 |
| Eye movement | 12 | 4 |
| Thinking | 5 | 3 |
| Typing | 6 | 6 |
| Listening | 4 | 2 |
| Speaking | 4 | 2 |
| Working | 4 | 4 |
| Sleep | 5 | 3 |
| Hover | 14 | 8 |
| Celebrate | 8 | 6 |
| Wave | 6 | 5 |
| Success | 6 | 4 |
| Optional Z effect | 3 | 3 |
| Total target | 91 references | **61 unique frames** |

The production sprite rebuild must verify this budget. If more than 64 unique frames are required, the motion system must be reviewed before increasing atlas size.
