# DON Motion System v1.0 — State Diagram

Visual dependency: DON v1.2, locked

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> Hover: eligible hover/focus
    Hover --> Idle: 3 jumps + recovery

    Idle --> Listening: chat open
    Listening --> Thinking: request submitted
    Listening --> Speaking: immediate response

    Thinking --> Typing: text production
    Thinking --> Working: task execution
    Thinking --> Speaking: response stream

    Typing --> Speaking: output stream
    Typing --> Working: execution continues
    Working --> Success: confirmed completion

    Speaking --> Listening: await reply
    Speaking --> Idle: output complete
    Success --> Listening: chat remains open
    Success --> Idle: settle complete

    Idle --> Sleep: extended inactivity
    Sleep --> Idle: wake
    Sleep --> Listening: chat open

    Idle --> Celebrate: explicit major milestone
    Listening --> Celebrate: explicit major milestone
    Working --> Celebrate: explicit major milestone
    Celebrate --> Idle: recovery complete
```

## Overlay model

Blink, slow blink, directional glances, idle breath, and Wave are not semantic states.

```mermaid
flowchart LR
    S[Semantic state owns body] --> G{State permits micro-action?}
    G -- No --> H[Hold approved still frame]
    G -- Yes --> Q[Wait randomized quiet window]
    Q --> P{Still eligible?}
    P -- No --> H
    P -- Yes --> A[Run one approved micro-action]
    A --> R[Stable recovery]
    R --> Q
```

The body-level action lock prevents Wave or any micro-action from layering over Hover, Celebrate, Success, Typing hand motion, or a state transition.

## State priority

| Priority | Request |
|---:|---|
| 100 | Hidden, destroyed, lifecycle stop |
| 90 | Celebrate |
| 80 | Success |
| 70 | Hover |
| 60 | Typing / Working |
| 50 | Speaking |
| 40 | Thinking |
| 30 | Listening |
| 20 | Sleep |
| 10 | Idle |
| 0 | Blink, glance, breath, Wave |

Priority selects the queued request. Locked one-shots still finish unless lifecycle safety requires immediate cancellation.

## Hover eligibility

```text
Idle
AND visible
AND document active
AND reduced motion disabled
AND body unlocked
AND 6-second cooldown expired
AND pointer/focus exit observed since previous Hover
```

Hover contains exactly three apexes: `-7 px`, `-6 px`, and `-5 px`.
