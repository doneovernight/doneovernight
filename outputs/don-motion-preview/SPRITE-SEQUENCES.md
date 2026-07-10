# DON Motion System v1.0 — Sprite Sequences

Visual dependency: DON v1.2, locked

## Naming

```text
don-v12-{view}-{sequence}-{frame}
```

Example:

```text
don-v12-front-hover-03
```

Frames are zero-padded. Durations belong in metadata, never filenames.

## Sequence inventory

| Sequence | References | Target unique | Playback |
|---|---:|---:|---|
| Views and stable poses | 4 | 4 | Still |
| Idle breath | 6 | 4 | Scheduled one-shot |
| Blink | 4 | 3 | Scheduled one-shot |
| Eye movement | 12 | 4 | Scheduled one-shot |
| Thinking | 5 | 3 | Entry then hold |
| Typing | 6 | 6 | Pair plus pause |
| Listening | 4 | 2 | Entry then hold |
| Speaking | 4 | 2 | Cadence plus hold |
| Working | 4 | 4 | Slow cycle plus hold |
| Sleep | 5 | 3 | Slow randomized cycle |
| Hover | 14 | 8 | Locked one-shot |
| Celebrate | 8 | 6 | Locked one-shot |
| Wave | 6 | 5 | Locked hosted gesture |
| Success | 6 | 4 | Locked one-shot |
| Optional Z | 3 | 3 | Optional effect-only sequence |
| Total | 91 references | **61 unique** | Fits 8 x 8 atlas |

## Frame reuse

Reuse is mandatory where geometry and meaning are identical.

- `idle-00` is the neutral source and stable return frame.
- Blink open frame reuses the neutral eye frame.
- Eye actions reuse neutral entry and return frames.
- Hover land 1 and land 2 reuse one landing frame.
- Hover final recovery reuses `idle-00`.
- Thinking hold may reuse the approved tilted frame.
- Listening hold may reuse its final entry frame.
- Speaking cadence returns to its neutral host frame.
- Success and Celebrate may share approved happy eye geometry, but not body poses.
- Working and Typing share the locked laptop construction.

Frame reuse must never change timing semantics.

## Hover ordered references

```text
hover-00  stable
hover-01  anticipation
hover-02  jump 1 rise
hover-03  jump 1 apex -7
hover-04  land 1
hover-05  jump 2 rise
hover-06  jump 2 apex -6
hover-04  land 2, reused
hover-07  jump 3 rise
hover-08  jump 3 apex -5
hover-09  final fall
hover-10  final land
hover-11  recovery
idle-00   stable return
```

Exactly three apex frames are present.

## Manifest requirements

Every sequence declares:

- semantic state or host state;
- ordered frame keys;
- per-frame durations;
- loop behavior;
- body or eye lock;
- interrupt policy;
- return-state policy;
- cooldown;
- required prop;
- reduced-motion representative frame;
- checksum-compatible character and motion versions.

## Atlas budget

- frame: `64 x 64` logical pixels;
- grid: `8 x 8`;
- atlas: `512 x 512`;
- capacity: `64` unique frames;
- target use: `61` unique frames;
- decoded RGBA memory: `1 MiB`;
- transparent background;
- nearest-neighbor rendering;
- no 4x review atlas shipped to product runtime.

If the production rebuild exceeds 64 unique frames, stop for motion review rather than silently growing the atlas.
