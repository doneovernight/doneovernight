# DON Motion System v1.0 — Performance Analysis

## Budget

| Resource | Ceiling |
|---|---:|
| Unique frames | 64 |
| Base atlas | 512 x 512 |
| Decoded atlas memory | 1 MiB |
| Compressed atlas target | 250 KiB |
| Manifest target | 12 KiB gzip |
| Controller target | 4 KiB gzip |
| Base asset requests | 2 |
| Optional extension requests | 1 |
| Frame draw work | under 2 ms p95 |
| Layout shifts | 0 |
| Timers while hidden | 0 |
| Idle CPU while still | approximately 0% |
| Active average CPU | under 1% reference desktop |

Ceilings are not targets. Stillness is the primary optimization.

## Why no 60 FPS loop

DON changes authored sprite frames at variable intervals. A permanent animation-frame callback would wake the main thread thousands of times while DON is visually still.

The approved scheduler chains one timer for the next authored frame, then stops. During quiet holds there is no render work.

## Memory model

```text
512 × 512 × 4 bytes = 1,048,576 bytes decoded
```

The logical atlas remains within the existing 8 x 8 structure by reusing stable, eye, landing, recovery, and laptop frames.

## Loading model

1. Static Idle poster is immediately available.
2. Manifest loads near viewport or on deliberate DON interaction.
3. Base atlas loads and decodes before animation begins.
4. Rare effects may load during idle time.
5. Asset failure leaves the static poster and product controls intact.

No individual frame requests are permitted.

## Runtime controls

- pause on `document.hidden`;
- pause 250 ms after leaving the viewport;
- resume from a stable state with a fresh quiet window;
- suppress idle actions during scrolling, typing, dragging, and modal use;
- allow only one automatic DON animator per viewport;
- do not replay missed animations after background activity;
- clear every timer and observer on destruction.

## Mobile profile

- no Hover sequence;
- quiet windows multiplied by 1.25;
- optional Z disabled;
- extended states loaded after chat open;
- immediate pause when backgrounded;
- data-saving profile avoids optional assets;
- low-power profile uses reduced automatic motion.

## Measurement plan

Record on reference desktop and mid-range mobile hardware:

- atlas download and decode duration;
- controller bundle size;
- main-thread cost per frame draw;
- CPU during 60 seconds of Idle;
- memory before and after atlas decode;
- timer count while visible, hidden, offscreen, and destroyed;
- layout shift score;
- network requests before and after chat open.

## Failure thresholds

The motion package is not ready for integration when:

- unique frames exceed 64;
- any permanent timer or animation-frame loop exists;
- hidden or offscreen timers continue;
- frame draw work exceeds 2 ms p95;
- the atlas causes layout shift;
- the static fallback is missing;
- more than three asset requests are required;
- mobile automatically loads optional effects.
