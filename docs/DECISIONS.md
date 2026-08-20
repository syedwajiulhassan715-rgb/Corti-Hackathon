# Decisions

## Locked
D1  TypeScript across src/ and web/. Corti's SDK, examples and diarization helper are TS;
    one language removes the cross-boundary tax. eval/ stays Python, offline only.
D2  Speech is the only source of judgement. Feeds corroborate, never conclude.
D3  Two signals per room, Patient State and Coordination State, kept separate.
D4  Scoring deterministic and doctor-owned. Agent proposes fit. Human books by voice.
D5  Event log is the sole interface. Engines and projections are pure functions.
D6  Three rooms. One continuous rehearsed scenario.
D7  Dispatcher before scheduler, Patient State before Coordination, no dependency between.
D8  No clock module. Engines and projections are pure functions taking `now` as an
    explicit argument. Live passes Date.now(); replay passes the timestamp of the last
    event read. Offer expiry and Task.delayed are derived at read time, never fired.
    Nothing under engines/ or projections/ may call Date.now(); only main.ts and
    server/index.ts do, and they pass it down. When a human acts on an expiry, that
    action is appended as an event.
    Reason: a timer that fires is a second source of truth. Derived-at-read-time keeps
    replay to T exact and removes every race between the tick and the log.
D9  world/ emits events only. feeds, roster and inventory append to the log; their
    snapshots are folds, never separate stores. MCP call results are appended as events
    so action and outcome are both auditable.
    Reason: a module holding its own state is a module nobody can replay. Appending the
    outcome as well as the call means a failed offer is visible, not silently absent.

## Graveyard
Vouch, medication reconciliation — killed on challenge fit.
Third Voice, patient vs companion contradiction — killed on narrow scenario, weak crowd appeal.
The Negotiator, plan vs life constraints — superseded when the ward brief arrived.
Haven-style camera ward — killed, its stack is illegal here and speech would be peripheral.
Multi-agent orchestration — killed, four of five "agents" are deterministic engines.

## Open
O1  V1 diarization result decides the size of pipeline/roles.ts.
O2  V3 MCP cost decides whether dispatch is a real call or a logged intent.
O3  Occupancy inferred from active sessions, or manual toggle fallback.
