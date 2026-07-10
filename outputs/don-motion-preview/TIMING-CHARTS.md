# DON Motion System v1.0 — Timing Charts

All values are milliseconds. Bars are relative, not fixed-FPS frames.

## One-shot duration comparison

| Sequence | Duration | Relative bar |
|---|---:|---|
| Blink | `180-270` | `██` |
| Slow blink | `400-560` | `████` |
| Success | `840` | `██████` |
| Wave | `890` | `██████` |
| Listening entry | `900` | `██████` |
| Hover | `1185` | `████████` |
| Celebrate | `1440` | `██████████` |
| Idle breath event | `1540` | `██████████` |
| Thinking entry | `760` | `█████` |
| Typing hand pair | `620` | `████` |
| Working cycle | `2300` | `███████████████` |
| Sleep cycle | `4920-6120` | `████████████████████████████` |

Long cycles contain long still holds. Bar length does not mean continuous motion.

## Quiet windows

| Scheduler | Window |
|---|---:|
| First Idle micro-action eligibility | no earlier than `4000` |
| Idle breath opportunity | `6500-12000` |
| Normal blink interval | `3800-8200` |
| Thinking eye micro-glance | `3500-6000` |
| Typing pause | `450-1100` |
| Working still hold | `900-1800` |
| Speaking cadence hold | `1400-2400` |
| Optional Sleep Z interval | `8000-14000` |
| Hover cooldown | `6000` plus exit/re-entry |
| HQ notification glance rate limit | `15000` |

## Hover timing lane

```text
0        140      290      370      510      590      730      885      1185 ms
| stable | prep | J1 apex | land | J2 apex | land | J3 apex | land/recovery |
                    -7 px           -6 px           -5 px
```

Exactly three apexes are required. Landing frames may be reused; apex frames may not be added or removed without a major motion-system revision.

## Transition timings

| From | To | Duration |
|---|---|---:|
| Idle | Listening | `220` |
| Listening | Idle | `240` |
| Listening | Thinking | `240` |
| Thinking | Typing | `260` |
| Thinking | Working | `260` |
| Thinking | Speaking | `220` |
| Typing | Speaking | `180` |
| Typing | Working | `180` |
| Working | Success | `240` |
| Speaking | Idle | `240` |
| Speaking | Listening | `180` |
| Idle | Sleep | `650` |
| Sleep | Idle | `480` |
| Safe state | Celebrate | `240` |
| Celebrate | Idle | `360` |

## Timing constraints

- minimum frame hold: `40`;
- maximum Celebrate duration: `2000`;
- maximum Idle body movement: `1 px`;
- no permanent animation loop;
- no frame catch-up after timer delay;
- variable holds are sampled per playback;
- consecutive blink timing tuples may not match.
