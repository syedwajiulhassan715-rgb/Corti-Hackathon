# ECHO v2

> Superseded SPEC v1 (ward dispatch) on 2026-08-21. See docs/DECISIONS.md D11
> for what was killed and why. The v1 anchor — two signals per room, dispatch
> to whoever is free — is gone. What survives is the evidence model, the event
> log, the Corti path and the honesty law.

## Problem

A ward's intelligence is trapped in the moment. A nurse takes a blood pressure,
notes it, and moves on. Tomorrow another nurse takes another one. Nobody holds
the two together. Deterioration that would be obvious across four days is
invisible across four separate observations, because no system is watching the
*trajectory* — only the reading in front of it.

Meanwhile every alerting system on the market fires on a single threshold
crossing, so it cries wolf, so nobody reads it.

## Anchor

ECHO quietly captures the nurse's normal work — speech, vitals, observations —
turns it into a patient's longitudinal history automatically, watches that
history for *persistent, corroborated* change, and ranks who needs attention
now. A Corti agent proposes the next workflow action. A human approves it.

## The one sentence that matters

**The nurse didn't trigger ECHO. The nurse simply did the job. ECHO connected
the history.**

## The core insight

Every competitor asks *"is this number abnormal?"*
ECHO asks *"is this patient's own trajectory bending, and does more than one
signal agree?"*

Baseline is **per patient**, never population. 145/90 is unremarkable for a
population and a large move for someone whose four-day baseline is 128/80.
That distinction is the entire product.

## Product law

Unchanged from v1 except where noted.

- Nothing enters state without a quote, speaker and timestamp.
- Escalation above WATCH requires **either** a speech event in its evidence
  **or** multi-signal numeric agreement persisting over time. *(Changed from
  v1: v1 required speech for any yellow. A four-day corroborated BP trend with
  no conversation is exactly what ECHO exists to catch, so numbers may now
  conclude — but only in agreement, and only over time. A single reading still
  never concludes.)*
- Fact extraction proposes candidates. Speaker-attributed segments decide.
- Deterministic scoring. The agent proposes, the human confirms.
- Nothing a human accepted is silently reassigned.
- A planned thing nobody discussed becomes a flag with the question to ask,
  never a guess.
- **The system waits for sufficient evidence.** A single observation becomes
  history, not an alert. Only defined emergency conditions skip the ladder.

## Architecture

```
Nurse's normal work
   ↓  Corti STT / vitals / observations
Event Log            (patientId is the primary key)
   ↓
Patient History      projections/patientHistory.ts
   ↓
Trend Engine         engines/patientTrend.ts
   ↓
Priority Engine      engines/prioritization.ts
   ↓
Attention Queue
   ↓
Corti agent proposes → human approves → action event → back into history
```

The event log remains the only interface between modules. `engines/` and
`projections/` are pure functions from events, take `now` as an argument, and
never read a clock. Only `main.ts` and `server/index.ts` call `Date.now()`.

## The escalation ladder

```
GREEN → WATCH → PERSISTING_CONCERN → HIGH → CRITICAL
```

A patient climbs it by accumulating *persistence* and *agreement*, not by
crossing a line once. Defined emergency conditions jump straight to CRITICAL;
they are listed as data in `engines/rules/`, not as code.

## Signals the trend engine computes

Per observation, per patient: baseline, current, delta, direction, rate of
change, persistence (how long the direction has held), duration, multi-signal
agreement, **missing observations**, and supporting conversation facts.

**Silence is a signal.** A patient nobody has observed in N hours, or a result
nobody reviewed, is a first-class trend — not an absence of one. No competing
product does this and it is nearly free from an event log.

## Corti — verified capabilities

See `.claude/skills/corti-api/SKILL.md`. Every field name there was confirmed
against the live tenant on 2026-08-21.

| Used for | Endpoint |
|---|---|
| Ambient STT | audio-bridge websocket + `/v2/interactions/{id}/transcripts/` |
| Fact taxonomy | `GET /v2/factgroups/` — 20 clinical groups, Corti's own ontology |
| Facts | `GET/POST /v2/interactions/{id}/facts/` |
| Medical coding | `POST /v2/tools/coding/` |
| Generation | `POST /v2/interactions/{id}/documents/` with a published template |
| Patient identity | `interaction.patient` — native, not bolted on |

**`/v2/tools/facts/` and `/v2/tools/generate/` are 403 on this tenant.** All
fact and generation work is interaction-scoped. One Corti interaction per nurse
round, carrying the patient's real identity, is the ECHO unit of work.

No other AI provider. No OpenAI, Anthropic or Gemini on the clinical path.

## Where the agent is and is not allowed

The agent does **not** decide whether a patient is deteriorating. The
deterministic engine decides that, from the doctor's rule tables.

The agent decides workflow: given trusted patient state, who should handle the
next task and what action to propose. Every action-changing operation requires
human approval and becomes an `action` event in the history.

## Patients

The ward is the **11 provided charts** in `fixtures/provided/text/` — real
organiser fixture data with dated longitudinal vitals, labs and encounters.
Their charted past is parsed into events. Their future is a deterministic
forward-simulator, labelled as simulated wherever it surfaces.

Not invented. `robert_okafor` (STEMI → PCI → post-MI HFrEF, four encounters)
and `elena_petrova` / `aisha_rahman` (explicit care-gap storylines) carry the
strongest arcs.

## Honesty law

Unchanged. If something is faked, say so in code and on stage. Fake the
environment, never the Corti path. The bedside monitor is simulated and labelled
`SIMULATED DEVICE`. The room-to-patient assignment is hardcoded and labelled.
The Corti calls are real.

## Scope

**MUST** — patient identity, automatic patient history, the 11-patient ward,
longitudinal trends, delayed priority escalation, attention queue, evidence on
every claim, Corti integration, ward UI, patient timeline, working demo.

**SHOULD** — medical coding as enrichment, agentic assignment with approval,
replay scrubber, generated handoff.

**NICE** — "why not" panel, handover diff, command palette, population view.

**KILL** — coordination signal, dispatcher, scheduler, ward-round order, task
memory, dictation confirm, live mic, a second scarce resource, any state change
without an event behind it.

## Acceptance test

`P-002` (elena_petrova) starts GREEN. A nurse records vitals and one sentence.
History updates automatically; no alert. Advance the simulation three times,
each adding vitals. The patient climbs WATCH → PERSISTING_CONCERN → HIGH. The
attention queue moves them to #1. The why-now panel explains it from trends and
quotes. The agent proposes an action. A human approves. The action becomes an
event. The timeline contains the whole story.

This runs as an automated test, not a manual checklist.
