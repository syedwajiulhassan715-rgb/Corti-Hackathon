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

D10 Feed-only escalation is split at the emergency line. A structured reading may raise a
    room to RED-EMERGENCY on the CLINICAL §2 numeric criteria alone — TOKS/NEWS >= 7, or
    any single parameter scoring 3 — with no grounded utterance required. It may never
    raise to YELLOW or RED-URGENT; those still need speech, and a reading only
    corroborates or sharpens the band.
    Reason: an emergency threshold is a threshold, not a judgement. Nobody is
    interpreting anything when a number crosses 7, and the ward already alarms on it.
    Staying green because no one happened to speak would not be principled restraint, it
    would be a worse version of the monitor beeping in the corridor.
    Below that line the judgement is the product. "Is this patient deteriorating in a way
    that matters" is exactly the call we claim to make from what people say, so a feed
    reading must not make it for us. This also keeps the demo unambiguous: below the
    emergency line, a yellow always means somebody said something, and nobody can ask
    whether the vitals would have done it anyway.
    Replaces the single FEED_MAY_RAISE_ALONE switch, which forced one answer to two
    different questions.

## Graveyard
Vouch, medication reconciliation — killed on challenge fit.
Third Voice, patient vs companion contradiction — killed on narrow scenario, weak crowd appeal.
The Negotiator, plan vs life constraints — superseded when the ward brief arrived.
Haven-style camera ward — killed, its stack is illegal here and speech would be peripheral.
Multi-agent orchestration — killed, four of five "agents" are deterministic engines.

## Closed
O1  CLOSED 2026-08-20 by V1 RESOLVED. Diarization separates two voices on a mixed mono
    track: 17 segments, speakerIds 0 and 1, 16 switches, every turn on the right slot.
    So roles.ts is a real module, not a stub.
    Role assignment is self-identification, with first speaker as the fallback.
    Question density was tried first and inverted on the only real recording we have: the
    clinician asked nothing and dismissed, the patient asked the single question in the
    file, so both roles came out backwards. A heuristic that fails on the first genuine
    input is not a heuristic, and clinical vocabulary — which had the right answer — is
    too weak to promote to primary on one sample.
    Self-identification keys on what people actually say when a ward round opens. First
    speaker is the fallback because the clinician opens the encounter in every script in
    CLINICAL §8. Both are stated in the result so the UI can show which one fired, and
    an unresolved assignment stays unresolved rather than guessing.
    STATUS: decided, NOT YET IMPLEMENTED. pipeline/roles.ts still ships question-density
    with a clinical-vocabulary tie-break, and is known to invert on
    fixtures/audio/test_twovoice_01. Do not demo role labels until it is rewritten.

## Open
O2  V3 MCP cost decides whether dispatch is a real call or a logged intent.
O3  Occupancy inferred from active sessions, or manual toggle fallback.
O4  Does a single parameter scoring 3 with no speech belong at RED-URGENT on the number
    alone? CLINICAL §2 bands it RED-URGENT, but D10 forbids feed-only escalation below
    the emergency line, so the engine currently rounds it up to RED-EMERGENCY. Three
    answers are possible: leave it at RED-EMERGENCY, carve a second numeric exception so
    the number alone can reach RED-URGENT, or require speech and let it sit at GREEN
    until someone speaks. Pending the clinician.
