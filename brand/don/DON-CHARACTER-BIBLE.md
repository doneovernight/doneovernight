# DON Character Bible

Version: `1.0.0-spec`

Classification: Permanent DONEOVERNIGHT brand asset

## 1. Identity

**Name:** DON

**Role:** Small AI operator

**Purpose:** Help people understand the system, find the relevant next step, and complete focused work with less friction.

DON is never loud, childish, annoying, or salesy. DON is calm, observant, helpful, and brief.

DON helps.

DON guides.

DON never interrupts.

## 2. Brand character

DON should feel like:

- a quiet operator inside the DONEOVERNIGHT system;
- capable without trying to appear powerful;
- attentive without watching the visitor;
- friendly without performing cuteness;
- modern without using trend-driven robot details;
- alive through timing and restraint rather than constant motion.

DON is not:

- a toy;
- a pet;
- a salesperson;
- a superhero;
- a generic robot;
- a human substitute;
- a decorative loading animation.

## 3. Defining silhouette

DON has a white, rounded, cloud-like head over an extremely clean compact body.

The head uses exactly three structural masses:

1. one central crown lobe;
2. one left support lobe;
3. one right support lobe.

These masses form a controlled cloud-like contour. They must not become a scalloped cartoon cloud, fluffy hair, a hood, a helmet, armor, or a stack of bubbles.

The dark face is inset into the lower half of the head. The face contains only two minimal cyan eyes.

The body contains no logo, chest mark, seam, button, vent, panel, belt, collar, armor, or permanent accessory.

## 4. Canonical pixel system

DON is authored on a `32 x 32` logical pixel grid.

This grid is permanent because every required display size is an integer nearest-neighbor multiple:

| Export | Logical scale | Use |
|---:|---:|---|
| `32 x 32` | `1x` | dense HQ status, compact navigation, tiny indicators |
| `64 x 64` | `2x` | default inline and workspace use |
| `96 x 96` | `3x` | website assistant, onboarding, documentation |
| `256 x 256` | `8x` | presentations, demos, large empty states |

The editing and QA master may be displayed at `64 x 64`, where each logical pixel is a `2 x 2` block. The underlying geometry remains `32 x 32`.

Do not author at 64 and resample to 96. Do not use fractional scaling. Do not smooth pixels.

## 5. Official proportions

All coordinates below are inclusive and use the 32 x 32 logical grid.

| Part | Bounds | Size | Rule |
|---|---|---:|---|
| Full visible character | `x4-27`, `y2-29` | `24 x 28` | Shared envelope for front-facing states |
| Head | `x6-25`, `y2-17` | `20 x 16` | Three-lobe cloud construction |
| Face | `x8-23`, `y7-14` | `16 x 8` | Centered dark inset |
| Body | `x9-22`, `y16-25` | `14 x 10` | Overlaps head by 2 px |
| Left arm | `x5-8`, `y17-24` | `4 x 8` | Mirrored for right arm |
| Right arm | `x23-26`, `y17-24` | `4 x 8` | Mirrored for left arm |
| Left leg | `x11-14`, `y24-28` | `4 x 5` | Two straight visible supports |
| Right leg | `x18-21`, `y24-28` | `4 x 5` | Same volume as left leg |
| Left foot | `x9-14`, `y27-29` | `6 x 3` | Flat base, one stepped front corner |
| Right foot | `x18-23`, `y27-29` | `6 x 3` | Exact mirrored construction |

### Ratios

- Head-to-lower-body visual mass: `60:40`.
- Head width to full character width: `20:24` (`83.3%`).
- Face width to head width: `16:20` (`80%`).
- Arm length to visible character height: `8:28` (`28.6%`).
- Visible leg length to character height: `5:28` (`17.9%`).
- Foot width to body width: `6:14` (`42.9%` per foot).
- Minimum internal cell clearance: 4 px left, 4 px right, 2 px top, 2 px bottom.
- Minimum product clear space outside the cell: 4 logical px on all sides.

## 6. Face and eyes

The face is a dark rounded rectangle made from explicit pixel steps, not a vector pill.

- Face bounds: `16 x 8` logical px.
- Face corner step: 3 px horizontal, 2 px vertical.
- Eye size: `2 x 3` logical px in the neutral state.
- Neutral eye rows: `y9-11`.
- Left eye columns: `x11-12`.
- Right eye columns: `x19-20`.
- Inner eye gap: 6 logical px.
- Eye center separation: 8 logical px.
- Maximum eye translation for looking states: 1 logical px.

The eyes are cyan. Cyan is not applied to the body.

DON has no mouth, nose, brows, cheeks, ears, or permanent status icon.

## 7. Body construction

The body is a single clean white mass.

- No chest logo.
- No body seam.
- No neck ring.
- No shoulder panel.
- No buttons.
- No armor.
- No cables.
- No permanent tool.

Arms are small side masses that remain visually subordinate to the head. In the neutral pose, hands are not separately drawn.

Legs are short and nearly hidden. Feet provide the stable ground line and must remain identical in width, height, and baseline across all front-facing states.

## 8. Turnaround system

Official production turnarounds will include:

1. front;
2. left side;
3. back;
4. right side.

Rules:

- All views share the same 32 x 32 cell.
- All feet share the same ground line at `y29`.
- Side views preserve the head height and body volume.
- The face appears as a narrow dark edge in side view.
- The back is completely unmarked.
- The back has no seam, port, hatch, logo, or light.
- Left and right views are structural mirrors unless an animation explicitly requires a directional pose.

### Turnaround geometry

| View | Head | Body | Face | Feet |
|---|---|---|---|---|
| Front | `x6-25`, `y2-17` | `x9-22`, `y16-25` | `x8-23`, `y7-14` | Canonical front pair |
| Left side | `x6-25`, `y2-17` | `x10-21`, `y16-25` | Leading edge `x7-9`, `y7-14` | Two overlapping `6 x 3` forms, near foot forward |
| Back | Exact front head silhouette | `x9-22`, `y16-25` | None | Exact front pair |
| Right side | Mirror of left side | Mirror of left side | Leading edge `x22-24`, `y7-14` | Mirror of left side |

In side views, the near arm keeps the canonical `4 x 8` volume; the far arm may show as a maximum 2 px edge. The two side-view feet overlap by 1 px but remain distinct and retain the canonical `6 x 3` construction. No view may change head height, crown height, body height, foot height, or baseline.

## 9. Official states

| State | Visual definition | Behavioral meaning |
|---|---|---|
| Idle | Neutral eyes, stable feet, rare 1 px breathing change | Available, not demanding attention |
| Blink | Eyes close together and reopen | Natural life signal |
| Sleep | Closed eyes, 1 px lower posture, slow breathing | Extended inactivity |
| Thinking | Eyes move 1 px upward | Processing a defined task |
| Listening | Eyes widen by 1 px, then settle | Ready for user input |
| Typing | Temporary laptop prop, alternating hands | Producing text or structured output |
| Working | Laptop present, gaze lowered, minimal movement | Executing a task |
| Hover | Exactly three descending jumps | Direct pointer or keyboard engagement |
| Celebrate | One subtle lift and raised arms | Rare major completion |
| Wave | One arm performs two controlled arcs | Greeting or deliberate sign-off |
| Looking Left | Both eyes move left by 1 px | Directional attention |
| Looking Right | Both eyes move right by 1 px | Directional attention |
| Success | Eyes soften briefly; body remains grounded | Confirmed completion |

The laptop is the only approved temporary prop in Phase 1 because Typing and Working require it. It is never part of DON's neutral identity and must disappear when the state ends.

## 10. Scale behavior

### 32 px

- Preserve the full silhouette.
- Eyes remain two 2 x 3 pixel blocks.
- Typing and Working use the canonical simplified laptop geometry; do not replace it with an icon.
- Do not add temporary decorative effects to compensate for the small scale.

### 64 px

- Default product rendering.
- All official states are available.
- Each logical pixel renders as a 2 x 2 device-pixel block.

### 96 px

- Preferred website, onboarding, and documentation size.
- Each logical pixel renders as a 3 x 3 device-pixel block.

### 256 px

- Used for presentations, demos, empty states, and brand documentation.
- Each logical pixel renders as an 8 x 8 device-pixel block.
- Never add detail at larger sizes. Scale the exact sprite.

## 11. Cross-product behavior

DON must be recognizably identical across the website, HQ, Client Workspace, Operator Workspace, mobile apps, documentation, and demos.

Products may control:

- display size from the approved list;
- official state;
- message copy according to `VOICE.md`;
- placement within accessibility and safe-area rules.

Products may not control:

- silhouette;
- palette;
- eye color;
- body tint;
- face dimensions;
- proportions;
- animation timing;
- unofficial expressions;
- permanent accessories.

## 12. Governance

DON is versioned as a brand asset, not as a local UI component.

Every production sprite package must include:

- version number;
- source file;
- turnaround sheet;
- state frames;
- animation strips;
- atlas;
- manifest with exact timing;
- required exports;
- change log;
- approval record.

Any permanent geometry change increments the major version. New approved states increment the minor version. Corrections that preserve geometry and timing increment the patch version.
