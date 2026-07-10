# DON Motion System v1.0 — Animation Flow

## Request lifecycle

```mermaid
flowchart TD
    E[Real product event] --> T[Translate to semantic request]
    T --> V{Visible and active?}
    V -- No --> F[Draw meaningful still frame]
    V -- Yes --> M{Reduced motion?}
    M -- Yes --> F
    M -- No --> L{Body locked?}
    L -- Yes --> C[Coalesce highest-priority request]
    L -- No --> R[Resolve transition route]
    R --> X[Play authored exit]
    X --> N[Commit semantic state]
    N --> I[Play authored entry]
    I --> H[Hold stable state frame]
    H --> Q{Micro-action permitted?}
    Q -- No --> H
    Q -- Yes --> W[Random quiet window]
    W --> A[Zero or one approved micro-action]
    A --> H
    C --> B[Wait for safe boundary]
    B --> R
```

## Hover flow

```text
stable
  → anticipation
  → jump 1 rise
  → apex -7
  → land 1
  → jump 2 rise
  → apex -6
  → land 2
  → jump 3 rise
  → apex -5
  → final fall
  → final land
  → recovery
  → stable Idle
  → 6000 ms cooldown + required exit/re-entry
```

Total playback: `1185 ms`.

## Work flow

```mermaid
sequenceDiagram
    participant Product
    participant FSM
    participant Renderer

    Product->>FSM: request submitted
    FSM->>Renderer: Listening → Thinking (240 ms)
    Product->>FSM: text production begins
    FSM->>Renderer: show laptop (260 ms)
    FSM->>Renderer: Typing hand pair (620 ms)
    FSM->>Renderer: random pause (450–1100 ms)
    Product->>FSM: execution continues
    FSM->>Renderer: Working cycle (2300 ms)
    Product->>FSM: confirmed complete
    FSM->>Renderer: remove laptop (240 ms)
    FSM->>Renderer: Success (840 ms)
    FSM->>Renderer: stable Idle or Listening
```

## Cancellation flow

Lifecycle cancellation—hidden document, destroyed instance, navigation replacement, or reduced-motion activation—invalidates the current transition token, clears timers, removes state-only props when needed, and draws the active state's approved still frame.

The engine never fast-forwards through missed frames after a hidden tab resumes.
