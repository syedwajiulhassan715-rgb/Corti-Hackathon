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
    STATUS: superseded by D11. The v2 golden path uses the verified cached
    interaction and evidence pipeline; role assignment remains conservative and
    unresolved speakers are never guessed.

## Superseded v1 questions
O2  Dispatch cost is outside the v2 golden path.
O3  Occupancy inference is outside the v2 golden path.
O4  Does a single parameter scoring 3 with no speech belong at RED-URGENT on the number
    alone? CLINICAL §2 bands it RED-URGENT, but D10 forbids feed-only escalation below
    the emergency line, so the engine currently rounds it up to RED-EMERGENCY. Three
    answers are possible: leave it at RED-EMERGENCY, carve a second numeric exception so
    the number alone can reach RED-URGENT, or require speech and let it sit at GREEN
    until someone speaks. Superseded by the v2 longitudinal model in D11.

---

## D11 — Pivot to longitudinal patient intelligence (2026-08-21)

**Decision.** ECHO v1 (two signals per room, dispatch to whoever is free) is
superseded. ECHO v2 watches a patient's trajectory over time. Authority: the
project owner, who has explicit authority to change the rules. See docs/GOALS.md
for the brief and docs/SPEC.md for the resulting spec.

**What was killed and deleted.** All were header-comment shells with zero
implementation, so nothing working was lost:

    src/agents/{dispatch,mcp,slotMatch}.ts
    src/engines/{coordination,scoring,taskMemory,wardRound}.ts
    src/engines/rules/{coordination,tasks,wardRound,weights}.*.ts
    src/projections/{queue,dispatchView,summary24}.ts
    src/contracts/{tasks,scheduling,state}.ts
    src/world/{roster,inventory}.ts
    src/corti/dictate.ts

**What survives, deliberately.** The event log, replay, the evidence model, the
Corti auth/coding/streaming path, roles, grounding, patientState and the ward
and history projections. The pivot reuses all of it.

**The one product law that changed.** v1: "Yellow or red requires at least one
speech event in its evidence. Numbers corroborate, never conclude." v2 permits
escalation on multi-signal numeric agreement that has persisted over time. A
four-day corroborated BP trend with nobody speaking is precisely the case ECHO
exists to catch, and the v1 law made it unreportable. A single reading still
never concludes, so the anti-crying-wolf property is preserved by *persistence
and agreement* rather than by requiring speech.

**Contract change.** `Event.patientId` added as a required field, placed
immediately after `ts`. The slug of the chart directory, not the MRN: readable
in a JSONL log, already the key `world/patients` loads by, and unmistakable for
a real identifier. `GroundedFact.patientId` is taken from the supporting event,
never from the candidate, so a mis-addressed proposal cannot launder itself
through the gate. 177 tests and the typecheck pass after the migration.

## D12 — Corti tenant capability probe (2026-08-21)

**Finding.** `POST /v2/tools/facts/` and `POST /v2/tools/generate/` return 403
on this tenant. The standalone facts and generation tools are not scoped to us.

**Consequence.** All fact and generation work is interaction-scoped:
`/v2/interactions/{id}/facts/` and `/v2/interactions/{id}/documents/`, both
verified working. This is the better path regardless — a Corti interaction
carries `patient` natively, so patient identity is Corti's own model rather
than something ECHO bolts on. One interaction per nurse round is the unit of
work.

**Also found.** `GET /v2/factgroups/` (no hyphen; the hyphenated path 403s)
returns 20 clinical fact groups. That is Corti's own ontology and ECHO adopts
it as its fact taxonomy rather than inventing one. Document generation against
`corti-nursing-note` was verified end to end and produced correct trend
comparisons unprompted, at ~0.024 credits per three-section note.

Every verified field name is recorded in `.claude/skills/corti-api/SKILL.md`,
which the API law now points at. That skill was referenced by CLAUDE.md from
the start but had never existed.
