# DON Mascot Visual Refinement v1.1

Status: Candidate review checkpoint

Scope: Three front-view silhouette candidates only

Recommendation: Candidate A — Cloud Crown

Production rebuild: Not started

## Decision

Candidate A is the recommended foundation for DON v1.1.

It creates the clearest permanent silhouette, separates the hood, face, torso, arms, and feet without adding decoration, and provides the strongest anatomical pivots for later animation. It remains calm and professional at small sizes while feeling materially more alive than v1.0.

This recommendation is not approval to rebuild the production frames. The 62-frame rebuild must wait for explicit candidate approval.

## v1.0 asset audit

The current production package was inspected and preserved unchanged.

| Contract | v1.0 result | v1.1 candidate action |
|---|---|---|
| Logical frame | `64 x 64` | Preserved for candidate evaluation |
| Frame count | `62` | Not changed |
| Animation groups | `11` | Not changed |
| Group names | `idle`, `blink`, `look`, `sleep`, `thinking`, `typing`, `laptop`, `hover_3_jump`, `celebrate`, `wave`, `listening` | Not changed |
| Atlas | `8 x 8`, `512 x 512` | Not changed |
| Metadata | Frame rectangles, durations, looping, blink interval | Not changed |
| Player API | `DONMascotPlayer`, `load`, `play`, `pause`, `destroy` | Not changed |
| Dependencies | None | Not changed |
| Runtime integration | Not present | Not added |

Compatibility fingerprints captured before the candidate pass:

```text
atlas PNG   62f8760954e073940e047d63d4efae8401ba1eb3b102212e60890c9e8336644b
atlas JSON  76c1d099ff7eab501ca12895ff1fcc8de41cbd8d4e452008f65dd0613525bb59
player JS   d488044ac9279de7cbe95acb2d808701b0ec5e40871d3633c31ce0ca874e53e6
runtime CSS 687d92c6a77edb51f6a89805cef9d93f31b9e7b19ce77ccd7e33ba2914c055d7
```

## Visual diagnosis

The v1.0 package is structurally sound, but the single continuous pebble construction creates four visual limitations:

1. The head and torso merge into one icon-like mass.
2. The side-mounted arms have weak shoulder articulation.
3. The rectangular feet read as appended blocks rather than anatomy.
4. Most expression is carried by the face while the posture remains rigid.

The quality reference was used only to set the bar for pixel-cluster discipline, dimensional shading, readable anatomy, and motion potential. Its character design, silhouette, face, proportions, colors, poses, and artwork were not copied.

## Candidate evaluation

### Candidate A — Cloud Crown

Strengths:

- most recognizable solid silhouette;
- controlled three-part crown establishes a permanent DON identifier;
- strong hood-to-torso bridge without a mechanical neck ring;
- smaller face improves the body-to-face balance;
- high arm attachments support wave, listening, success, and laptop poses;
- compact wedge feet establish a useful landing and anticipation system;
- clearest animation pivots for tilt, lean, compression, lift, and impact;
- retains DONEOVERNIGHT restraint.

Risks to control in the production pass:

- keep the crown controlled so it does not become a fluffy cartoon cloud;
- reduce left/right symmetry through posture, not anatomical drift;
- lock the foot master before rebuilding any motion frames.

### Candidate B — Operator Mantle

Strengths:

- immediate recognition;
- strong volume and clear face readability;
- expressive upper-body range.

Reasons it is not recommended:

- face and hood dominate too much at 32 px;
- broad mantle and large hands move the character toward cute or toy-like;
- torso has less room for compact laptop staging;
- silhouette is less compatible with DONEOVERNIGHT's quiet, professional tone.

Candidate B remains useful as the upper boundary for softness and expression.

### Candidate C — Quiet Operator

Strengths:

- best 32 px legibility;
- compact, professional, and controlled;
- clean separation between head and torso;
- closest compatibility path from v1.0.

Reasons it is the fallback rather than the recommendation:

- silhouette is less distinctive;
- squared hood and straight torso can return to generic robot territory;
- fewer unique shape anchors for expressive motion;
- offers less visual ownership as a permanent brand asset.

## Scoring

| Criterion | A | B | C |
|---|---:|---:|---:|
| Recognizability | 5/5 | 5/5 | 4/5 |
| Small-size readability | 4/5 | 3/5 | 5/5 |
| Animation potential | 5/5 | 4/5 | 4/5 |
| Professional appearance | 5/5 | 3/5 | 4/5 |
| DONEOVERNIGHT consistency | 5/5 | 4/5 | 5/5 |
| Total | **24/25** | **19/25** | **22/25** |

## Candidate asset construction

- Each candidate is evaluated on a true `64 x 64` logical grid.
- The delivered PNG is an `8x` nearest-neighbor review enlargement at `512 x 512`.
- Background is transparent.
- Edges are hard; antialiasing is removed.
- Pixels are snapped to a controlled palette.
- White-body volume uses five restrained tones: highlight, base, midtone, shadow, and edge.
- Face uses graphite and near-black depth.
- Eyes use one pale-cyan family.
- No cast shadow or product background is included.

These are silhouette-approval candidates, not production animation frames. Geometry will be normalized only after one candidate is approved.

## Production constraints carried forward

If Candidate A is approved, the v1.1 rebuild must:

1. preserve the 11 animation groups and 62-frame structure where technically possible;
2. preserve filenames, transparent backgrounds, atlas packing, metadata keys, and player API;
3. lock one canonical foot construction before authoring animation poses;
4. rebuild front, left, back, and right views from the same hood, torso, arm, and foot masters;
5. retain exactly three descending hover jumps and the existing animation lock;
6. add posture changes without exaggerated squash or anatomical drift;
7. keep the laptop temporary and exclusive to `typing` and `laptop` states;
8. update frame bounds or timing metadata only when the approved art requires it;
9. ship migration and compatibility notes before any product integration;
10. remain unmerged and undeployed until visual QA is approved.

## Generation provenance

The three starting concepts were produced with the built-in image-generation workflow. The existing v1.0 turnaround was supplied as the identity baseline; the Joi/Codex-style sheet was supplied as quality and motion reference only. Chroma backgrounds were removed locally, after which each candidate was reduced to a real 64 px logical grid, alpha-thresholded, palette-quantized, and enlarged with nearest-neighbor scaling.

Final prompt contracts:

### A — Cloud Crown

```text
Create one original front-facing DON candidate with a controlled three-lobe cloud crown, smaller dark face, attached compact torso, high rounded arm attachments, and grounded rounded wedge feet. Preserve white body, pale-cyan minimal eyes, quiet operator identity, and 64 px sprite intent. Use deliberate pixel clusters and five-tone restrained volume shading. Do not copy either reference. No logo, armor, buttons, seams, accessories, mouth, antenna, glow, gradients, block feet, long arms, text, or watermark.
```

### B — Operator Mantle

```text
Create one original front-facing DON candidate with a gently offset hood crown, broad soft side mantle, smaller inset face, short tapered attached torso, raised compact arms, and identical rounded capsule-wedge feet. Preserve the minimal white, graphite, and pale-cyan identity. Use premium hard pixel clusters and restrained five-tone volume. Avoid Candidate A's crown, copied reference geometry, decoration, long arms, detached hands or feet, block feet, toy styling, text, and watermark.
```

### C — Quiet Operator

```text
Create one original front-facing DON candidate with a softly squared offset cloud hood, compact low face, connected rounded trapezoid torso, high inward arms, and identical low crescent-wedge feet. Keep the pose calm with minimal tilt and professional proportions. Use authentic hard-cluster pixel art with restrained five-tone white-body volume. Avoid the other candidates' defining crowns, generic robot detail, oversized head or visor, long arms, block feet, accessories, text, and watermark.
```

## Review gate

Approve one candidate before any turnaround, frame, atlas, metadata, timing, or player work begins.

Recommended approval: **Candidate A — Cloud Crown**.
