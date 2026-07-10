# DON Motion Bible v1.0

Status: Official motion foundation

Character dependency: DON visual system v1.2

Scope: Website, HQ, Client Workspace, Operator Workspace, and future mobile apps

## 1. Purpose

The DON Motion System makes DON feel present, calm, and capable through restrained state-based animation.

Motion is never decoration. It communicates availability, attention, work, completion, or rest. When no state needs to be communicated, DON is still.

The desired effect is quiet life. Visitors should notice that DON feels considered without repeatedly noticing that DON is animated.

## 2. Immutable visual contract

DON v1.2 is locked. Motion may pose or translate approved anatomy, but it may not redesign it.

The following are immutable:

- Cloud Crown hood silhouette;
- overall proportions;
- canonical front, left, right, and back construction;
- face bounds and dark-face construction;
- minimal cyan eyes;
- shoulder attachment points;
- torso construction;
- leg volume;
- canonical feet and ground line;
- body palette and upper-left lighting;
- absence of logo, seams, armor, buttons, mouth, brows, and permanent accessories.

The laptop remains the only approved temporary prop. It appears only in Thinking laptop variant, Typing, and Working.

No motion implementation may interpolate, morph, redraw, recolor, or procedurally distort DON's anatomy.

## 3. Motion personality

DON is:

- calm;
- attentive;
- deliberate;
- useful;
- nearly still;
- responsive only when context justifies a response.

DON is not:

- a game character;
- a loading spinner;
- a notification badge;
- a conversion device;
- a decorative loop;
- a substitute for product status or accessible text.

The motion test is simple: if removing an animation does not reduce meaning, trust, orientation, or perceived life, remove it.

## 4. System architecture

DON motion has three layers.

### Layer 1 — semantic finite state machine

Exactly one semantic state owns DON at a time:

- Idle
- Hover
- Thinking
- Typing
- Listening
- Speaking
- Sleep
- Celebrate
- Success
- Working

State ownership determines the approved body pose, prop visibility, transition policy, and interruption policy.

### Layer 2 — micro-action scheduler

Blink and eye movement are not semantic states. They are optional micro-actions that may run only when the active state explicitly allows them.

Micro-actions:

- natural blink;
- slow blink;
- look left;
- look right;
- glance up;
- glance down;
- idle breath.

The scheduler uses randomized windows, not a permanent loop.

### Layer 3 — renderer

The renderer displays authored sprite frames from versioned metadata. It owns no product meaning and makes no state decisions.

The renderer must:

- preserve the 64 x 64 logical frame;
- use transparent sprites;
- use nearest-neighbor rendering;
- disable image smoothing;
- use variable per-frame durations;
- pause when hidden or offscreen;
- expose no character geometry controls to product code.

## 5. Motion grammar

### Stillness first

Still frames are valid output. Idle does not imply continuous motion.

### Integer movement

All authored anatomy movement uses whole logical pixels. The maximum idle displacement is 1 logical pixel.

### Pose, do not stretch

Posture changes come from translation, tilt, arm angle, leg compression, and approved eye frames. Body parts do not stretch, scale, or change volume.

### Finish actions

Every one-shot action includes anticipation where needed, a readable action, and a stable recovery frame.

### No stacking

Only one body-level sequence may run. A new request is queued, coalesced, ignored, or applied at the next safe transition point. It is never layered over the current sequence.

### No mechanical repetition

Random windows affect idle breath timing, blink timing, blink duration, eye glance choice, and typing pauses. Randomization never changes anatomy or semantic meaning.

### Return to meaning

After a one-shot state, DON returns to the correct semantic state rather than always returning blindly to Idle.

## 6. Global invariants

1. No automatic animation may begin before DON is visible.
2. No animation continues when the document is hidden.
3. Offscreen instances pause after 250 ms outside the viewport.
4. Only one DON instance per viewport may animate automatically. Other instances remain on meaningful still frames.
5. Blink and eye motion are blocked during transitions, Hover, Celebrate, Success, Wave sequence playback, Sleep entry/exit, and active typing keystrokes.
6. Laptop presence is controlled by semantic state, not individual frames.
7. Hover contains exactly three jumps.
8. Hover cannot restart while running.
9. Hover cannot retrigger until the pointer or focus exits, re-enters, and the cooldown has expired.
10. Celebrate runs once, lasts less than 2 seconds, and never loops.
11. Reduced motion disables all automatic decorative movement.
12. Animation never carries information that is absent from product UI or assistive text.

## 7. State definitions

### Idle

Meaning: available without requesting attention.

Default output is the still neutral frame. A breath may occur after a randomized quiet period. Breath movement is limited to one pixel in the upper body. Idle never sways, floats, bobs, or moves continuously.

Allowed micro-actions: blink, slow blink, one directional glance, idle breath.

### Hover

Meaning: acknowledges deliberate pointer hover or keyboard focus.

Hover is a locked one-shot sequence with anticipation, exactly three descending jumps, final land, and recovery. It ignores repeated hover and focus events while locked.

Allowed micro-actions: none.

### Thinking

Meaning: processing a defined request before execution.

DON uses a one-pixel head bias and a tiny eye adjustment, then becomes still. The optional laptop variant may be used when the reasoning context is explicitly work-oriented. A long-running task transitions to Working rather than looping Thinking motion.

Allowed micro-actions: rare blink during a still hold; one eye micro-glance no more than once every 3.5-6 seconds.

### Typing

Meaning: actively producing text or structured input.

The laptop is visible. Eyes focus downward. Hands alternate by one pixel. The torso may move by one pixel once per cycle. Every cycle is followed by a randomized pause.

Allowed micro-actions: blink only during the pause.

### Listening

Meaning: ready for user input or receiving live input.

DON performs one subtle entry tilt and one-pixel anticipation, then holds. Listening does not pulse, nod repeatedly, or imitate audio levels.

Allowed micro-actions: blink after the entry completes; no idle breath while live input is active.

### Speaking

Meaning: DON output is actively streaming or being read aloud.

DON has no mouth. Speaking uses a rare, restrained eye-softening cadence while the body remains still. Text streaming itself is the primary signal.

Allowed micro-actions: authored eye-softening sequence every 1.4-2.4 seconds; no blink during the same cadence.

### Sleep

Meaning: extended inactivity or explicitly inactive assistant mode.

Eyes remain closed. Slow breathing uses one pixel. Sleep never snores, rocks, or powers off. One Z particle is optional, off by default, and may appear only at long randomized intervals.

Allowed micro-actions: sleep breath; optional single Z cycle every 8-14 seconds.

### Celebrate

Meaning: rare major milestone.

One restrained arm lift and one body lift occur, followed by a stable recovery. Celebrate is not used for ordinary button confirmation. Maximum duration is 2 seconds.

Allowed micro-actions: none.

### Success

Meaning: a confirmed requested action completed.

Eyes use the approved happy expression. The body lifts one pixel once, settles, and returns to the correct semantic state.

Allowed micro-actions: none.

### Working

Meaning: executing a task beyond text entry.

The laptop is visible. Eyes alternate between the screen center and one lower focus position. One hand may move once per work cycle. Holds are deliberately long.

Allowed micro-actions: blink during a still hold; no idle breath.

### Wave gesture

Meaning: deliberate greeting or sign-off initiated by a real product event.

Wave is a locked body gesture hosted by Idle or Listening. It is not an additional semantic state. One arm performs one restrained outward-and-back arc while the torso and feet remain still. The hand endpoint moves no more than 3 logical pixels between adjacent frames.

Allowed micro-actions: none during playback.

## 8. Interruption policy

State changes use safe boundaries.

- Idle, Listening, Thinking, Speaking, Sleep, and Working may exit at defined transition frames.
- Typing exits at the end of the current hand pair or pause.
- Hover, Celebrate, and Success are locked one-shots and normally complete before another body sequence begins.
- A safety, visibility, navigation, or destruction event may cancel immediately to a still frame.
- Sleep exits immediately on deliberate user interaction using its authored wake transition.
- Repeated requests for the current state are coalesced.
- A queued Success supersedes a queued Hover or idle micro-action.
- Celebrate is never automatically queued after Success.

## 9. Website and workspace reactions

| Event | Motion response | Non-motion behavior |
|---|---|---|
| Page load | Show still Idle; schedule first micro-action no earlier than 4 seconds | Never open chat or speak automatically |
| 5 seconds inactivity | Remain Idle; permit at most one breath or glance through randomized scheduling | No prompt repetition |
| Hover or keyboard focus | Run locked three-jump Hover when eligible | Preserve control focus and label |
| Chat open | Transition to Listening in 220 ms | Focus the real chat input according to product rules |
| Chat close | Settle to Idle in 240 ms | Preserve conversation and user position |
| Task complete | Run Success once | Announce completion through product status |
| Page change | Cancel decorative micro-actions; show still Idle after navigation | Do not replay welcome behavior |
| Explicit success event | Run Success once; never chain Celebrate automatically | Update real interface status first |
| Import complete | Run Success only for a user-initiated visible import | Background completion uses a normal notification |
| HQ notification | One glance toward the relevant region if Idle and rate-limit allows | Notification content remains in the HQ UI |

## 10. Platform behavior

### Desktop

- Pointer Hover and keyboard focus share the same eligibility lock.
- A focus-visible ring belongs to the control, not the character sprite.
- Automatic micro-actions stop during text entry, drag operations, and modal interaction.
- When several DON instances exist, only the active or nearest visible instance animates.

### Mobile

- Hover does not exist.
- Tap or chat open transitions to Listening; scrolling never triggers a jump.
- Idle breath frequency is reduced by 25 percent.
- Optional Z particles are disabled by default.
- Motion pauses immediately when the app backgrounds or the page becomes hidden.
- Low Power Mode or data-saving signals select the reduced automatic-motion profile when available.

## 11. Approval boundary

Motion System v1.0 may be changed only through a versioned review.

A major version is required for:

- adding or removing semantic states;
- changing Hover jump count;
- changing interruption or stacking rules;
- changing reduced-motion semantics;
- changing the renderer contract;
- allowing new props or anatomy behavior.

A minor version is required for:

- adding an approved transition;
- changing event mappings;
- changing platform policies;
- adding a new non-breaking micro-action.

A patch version is sufficient for timing correction that preserves perceived motion and state meaning.

## 12. Canonical companion documents

- `STATE-MACHINE.md` — state ownership, priorities, transition graph, locks, and event handling.
- `ANIMATION-TIMINGS.md` — frames, durations, curves, cooldowns, and sprite sequence contract.
- `IMPLEMENTATION-GUIDE.md` — renderer, loading, performance, accessibility, desktop, and mobile strategy.
