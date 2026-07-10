# DON Asset System

Status: Folder foundation for future production sprites. No sprite artwork is approved in Phase 1.

## Directory contract

```text
ASSETS/
  source/         Editable canonical character source
  turnarounds/    Approved front, left, back, and right sheets
  states/         Approved still frames by semantic state
  animations/     Ordered frame strips and timing review sheets
  atlases/        Runtime atlases at approved integer scales
  exports/        Product-ready transparent PNG exports
  manifests/      Frame coordinates, durations, versions, and checksums
  reference/      Approved comparison and scale-review material
```

Each directory contains a README that defines what may be placed there.

## Naming convention

Use lowercase ASCII and hyphens.

### Individual frame

```text
don-{view}-{state}-{frame}@{scale}x.png
```

Examples:

```text
don-front-idle-00@1x.png
don-front-idle-00@2x.png
don-front-hover-03@3x.png
don-left-wave-02@8x.png
```

### Animation strip

```text
don-{view}-{state}-strip@{scale}x.png
```

Example:

```text
don-front-hover-strip@1x.png
```

### Turnaround

```text
don-turnaround-v{major}.{minor}@{scale}x.png
```

### Atlas

```text
don-atlas-v{major}.{minor}@{scale}x.png
don-atlas-v{major}.{minor}.json
```

### Source

```text
don-character-v{major}.{minor}.{patch}.aseprite
don-character-v{major}.{minor}.{patch}.ora
```

The first approved editable format will be declared during sprite-production Phase 2. Until then, no empty or guessed source file should be created.

## Controlled vocabulary

### Views

- `front`
- `left`
- `back`
- `right`

### States

- `idle`
- `blink`
- `sleep`
- `thinking`
- `listening`
- `typing`
- `working`
- `hover`
- `celebrate`
- `wave`
- `look-left`
- `look-right`
- `success`

### Frame numbers

- Two digits, zero-padded: `00`, `01`, `02`.
- Do not encode timing in filenames.
- Timing belongs in the manifest.

### Scales

| Suffix | Pixel size |
|---|---:|
| `@1x` | 32 px |
| `@2x` | 64 px |
| `@3x` | 96 px |
| `@8x` | 256 px |

## Export specification

- Format: transparent PNG.
- Color space: sRGB.
- Logical grid: 32 x 32.
- Scaling: integer nearest-neighbor only.
- Alpha: straight/unmatted.
- Background: transparent.
- Cast shadow: excluded.
- File metadata: version and state stored in the manifest, not rendered into the image.

## Manifest requirements

The future production manifest must include:

- character-system version;
- source revision;
- atlas filename and dimensions;
- logical frame size;
- frame rectangles;
- state names;
- ordered frames per animation;
- duration per frame in milliseconds;
- loop or one-shot behavior;
- anchor and ground-line coordinates;
- palette values;
- export sizes;
- SHA-256 checksum for every runtime asset;
- approval date and approver.

## Future implementation strategy

This is the integration contract for Phase 2 and later. It is a strategy, not runtime code.

1. The canonical editable source produces approved 32 x 32 frames.
2. One deterministic export process generates the `1x`, `2x`, `3x`, and `8x` transparent PNG assets directly from those frames.
3. The exporter builds a versioned atlas and manifest; product teams never hand-pack or retime frames.
4. A product renderer reads frame rectangles and durations from the manifest. It does not encode animation timing locally.
5. A semantic state controller requests only approved state keys. The controller applies the priority, lock, transition, and reduced-motion rules in `MOTION-GUIDE.md`.
6. One DON animation owns the character at a time. Product events may request a state, but cannot manipulate individual frames.
7. The same versioned asset package is consumed by the website, HQ, Client Workspace, Operator Workspace, mobile apps, documentation, and demos.
8. Accessibility text and task status remain separate from the sprite. Animation is never the only carrier of information.
9. Hidden or offscreen renderers pause their scheduler; returning instances resume from a stable semantic state, not a stale intermediate frame.
10. A new package is released only after every review gate below passes and the manifest checksums match the exported files.

Product adapters may differ by platform, but they must not fork the art, palette, timing, state names, or manifest data. Phase 1 ships no renderer and makes no website change.

## Review gates

No file moves from source to approved exports until it passes:

1. silhouette review;
2. 32 px readability review;
3. turnaround consistency review;
4. foot and baseline review;
5. palette validation;
6. frame-timing review;
7. reduced-motion review;
8. cross-product preview review;
9. checksum and manifest validation;
10. explicit brand approval.
