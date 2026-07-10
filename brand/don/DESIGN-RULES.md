# DON Design Rules

Version: `1.0.0-spec`

## 1. Art-direction boundary

The attached concept is direction only. It may inform scale, restraint, pixel discipline, and animation-first thinking. It must not be traced or recreated.

DON's official construction is defined by this repository, not by the reference image.

Do not copy the reference's:

- silhouette;
- head shape;
- face shape;
- head-to-body proportions;
- torso construction;
- eye geometry;
- feet;
- shading;
- poses;
- panel composition;
- animation frames.

## 2. Pixel-grid rules

- Canonical grid: `32 x 32` logical pixels.
- No subpixel geometry.
- No antialiasing.
- No vector smoothing in exported sprites.
- No bilinear or bicubic scaling.
- Use nearest-neighbor only.
- All motion distances are integer logical pixels.
- Every frame must use the same canvas, anchor, and ground line.

### Coordinate anchors

- Cell origin: top-left `(0,0)`.
- Character optical center: `x16`.
- Head optical center: `x16`.
- Ground line: `y29`.
- Neutral face center: `(16,10.5)`.
- Neutral body center: `(15.5,20.5)`.
- Motion pivot: midpoint between the feet at `(16.5,29)`.

## 3. Head construction

The head is cloud-like through three controlled structural lobes.

### Lobe geometry

- Central crown lobe: spans `x11-20`, begins at `y2`, nominal radius 4 px.
- Left support lobe: spans `x6-15`, begins at `y5`, nominal radius 5 px.
- Right support lobe: spans `x16-25`, begins at `y5`, nominal radius 5 px.
- Lower head closes at `y17` and overlaps the body by 2 px.

The three lobes must resolve into one clean silhouette. They may not read as separate bubbles, hair, ears, a hood, or a helmet.

### Head prohibitions

- No fluffy scallops.
- No spikes.
- No antenna.
- No ears.
- No hood opening.
- No helmet rim.
- No top light.
- No floating particles in the neutral state.

## 4. Body construction

- Body bounds: `14 x 10` logical px.
- Body corner step: 3 px.
- Head overlap: 2 px.
- Body fill is uninterrupted.
- Body has no internal line work.
- The bottom body contour may contain only the pixels required to meet the legs.

The body must not become pear-shaped, armored, mechanical, or human-anatomical.

## 5. Arms, legs, and feet

### Arms

- Neutral arm envelope: `4 x 8` px.
- Arm width may narrow to 3 px near the body.
- Arm reach may extend a maximum of 4 px beyond the neutral character envelope during Wave or Celebrate.
- Hands are implied by the terminal arm pixels; fingers are never drawn.
- Arm thickness remains consistent across front, side, and back views.

### Legs

- Visible leg envelope: `4 x 5` px per leg.
- Legs are vertical supports, not articulated limbs.
- Knee lines are forbidden.
- Leg separation remains 3 logical px at the narrowest point.

### Feet

- Each foot: `6 x 3` px.
- Both feet share `y29` as the baseline.
- Inner foot gap: 3 px.
- Front outer corner: one 1 px step.
- Heel corner: square or one 1 px step according to view.
- Feet must not rotate independently in front-facing calm states.
- Foot size never changes between states.

## 6. Face construction

- Bounds: `x8-23`, `y7-14`.
- Size: `16 x 8` px.
- Corner construction: 3 px horizontal step and 2 px vertical step.
- Face is centered within the head.
- Face cannot become wider, taller, or detached for expression.
- The lower face-depth row is optional at 64 px and above but must be part of the same palette.

The face is not glass, reflective, glowing, or translucent. It is a flat dark inset.

### Official corner radii

Pixel radii are constructed as integer stair steps, never as antialiased vector curves.

| Form | Nominal radius | Pixel construction |
|---|---:|---|
| Crown lobe | 4 px | Symmetric 1 px steps across the upper contour |
| Support lobes | 5 px | Symmetric 1 px steps joining the crown without scallops |
| Face | 3 px | 3 px horizontal by 2 px vertical corner step |
| Body | 3 px | 3 px corner step with uninterrupted fill |
| Feet | 1 px | One stepped outer corner; flat baseline |

## 7. Eyes

- Neutral size: `2 x 3` px.
- Neutral color: DON Cyan.
- Inner gap: 6 px.
- Center separation: 8 px.
- Maximum translation: 1 px horizontally or vertically.
- Maximum temporary size: `3 x 3` in Listening.
- Closed-eye size: `3 x 1` per eye.
- Eyes always move together except during a blink transition.

### Allowed expressions

| Expression | Eye construction |
|---|---|
| Neutral | Two vertical `2 x 3` cyan blocks |
| Blink | `2 x 2`, then `3 x 1`, then reopen |
| Sleep | Two `3 x 1` closed eyes |
| Thinking | Both eyes translate up 1 px |
| Listening | Both eyes widen to `3 x 3`, then return |
| Focused work | Both eyes reduce to `2 x 2` and translate down 1 px |
| Look left | Both eyes translate left 1 px |
| Look right | Both eyes translate right 1 px |
| Success | Two restrained upward 3 px eye marks for no more than 480 ms |

### Forbidden expressions

- mouth;
- smile line;
- frown;
- eyebrows;
- wink;
- crossed eyes;
- star eyes;
- heart eyes;
- tears;
- blush;
- anger marks;
- sweat drop;
- tongue;
- shock face;
- emoji imitation;
- asymmetric eye sizes;
- eye colors other than DON Cyan.

## 8. Official palette

| Token | Hex | Use |
|---|---:|---|
| `don.body.highlight` | `#FFFFFF` | Sparse upper-left contour pixels |
| `don.body.base` | `#F7FAFA` | Primary body fill |
| `don.body.shadow` | `#DDE6E8` | Lower-right internal contour pixels |
| `don.body.edge` | `#B9C6C9` | One-pixel external separation edge |
| `don.face.base` | `#10171B` | Face inset |
| `don.face.depth` | `#080D10` | Optional lower edge and laptop depth |
| `don.eye.cyan` | `#73E6F2` | Eyes only |

No product may recolor these tokens.

Dark and light interface backgrounds are not part of the character palette. The edge color must remain present on both.

## 9. Lighting rules

- Fixed light direction: upper-left, approximately 10 o'clock.
- Highlight depth: maximum 1 logical px.
- Shadow depth: maximum 1 logical px in the neutral sprite.
- Highlight pixels may appear on the crown, left head edge, left body edge, and upper feet.
- Shadow pixels may appear on the lower-right head edge, lower body edge, right arm, right leg, and rear foot edge.
- Lighting is identical across products and states.

Forbidden:

- gradients;
- soft airbrush shading;
- rim glow;
- bloom;
- lens effects;
- metallic reflections;
- glass reflections;
- product-colored lighting;
- animated light sweep.

## 10. Shadow rules

The master sprite contains no cast shadow.

An optional product-level contact shadow may be placed outside the sprite when grounding is necessary:

- width: 12 logical px at 32 px scale;
- height: 1 logical px;
- center: `x16`;
- position: 1 px below the ground line;
- color on dark surfaces: `rgba(0,0,0,0.28)`;
- color on light surfaces: `rgba(16,23,27,0.14)`;
- no blur at native pixel sizes;
- shadow contracts during jumps but never disappears completely.

No drop shadow may be baked into the exported sprite.

## 11. Temporary prop rule

DON has no permanent accessories.

The only approved Phase 1 prop is the laptop used by Typing and Working.

Laptop rules:

- flat graphite construction;
- open lid bounds: `x8-23`, `y20-25` (`16 x 6` px);
- base bounds: `x7-24`, `y26-27` (`18 x 2` px);
- lid corner step: 2 px; base corner step: 1 px;
- centered on the character optical axis;
- overlaps the lower body but never changes the body, leg, or foot master geometry;
- no manufacturer mark;
- no DONEOVERNIGHT logo;
- no stickers;
- no keyboard lettering;
- no glow;
- no decorative screen content;
- maximum width: 18 logical px;
- disappears immediately when the work state ends.

Any additional prop requires a future character-system revision.

## 12. Scale and export rules

| Output | Scale method | Notes |
|---:|---|---|
| 32 px | Native `1x` | Minimum approved size |
| 64 px | Nearest-neighbor `2x` | Default product size |
| 96 px | Nearest-neighbor `3x` | Preferred website and documentation size |
| 256 px | Nearest-neighbor `8x` | Large presentation size |

Rules:

- Export PNG with alpha.
- Preserve sRGB.
- Do not premultiply against a background.
- Do not optimize by reducing palette entries inconsistently between frames.
- Do not export JPEG, SVG auto-traces, or filtered WebP as the master.
- Derived WebP/AVIF may be used only when pixel fidelity, alpha, and color values validate exactly.
- Never add detail for 256 px.

## 13. Quality-control checklist

Every new frame must pass all checks:

- 32 x 32 logical canvas;
- character anchor unchanged;
- ground line unchanged unless jumping;
- official palette only;
- no antialiasing;
- no chest detail;
- correct eye spacing;
- feet identical to the canonical construction;
- no unintended silhouette drift;
- no state-only pixels remaining after the state;
- readable at 32, 64, 96, and 256 px;
- consistent front, side, and back volume.
