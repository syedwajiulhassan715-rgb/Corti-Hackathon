# AGENTS.md — ECHO Hackathon

## Mission

Build **ECHO — Every Clinical Observation**, a reliable Corti-powered prototype.

> **Most clinical systems remember events. ECHO remembers trajectories.**
> Routine nursing work should automatically become longitudinal memory, detect meaningful deterioration/care gaps, prioritize attention, and prepare the next action for human approval.

## Core Loop

`Nursing work → capture → event log → history → trend/persistence → priority → care gap → attention queue → Corti agent → MCP → prepared action → human approval → action event`

Never reduce ECHO to `symptom → instant AI alert`. Observations update history first; escalate sustained evidence unless an explicit emergency rule applies.

## Architecture

* **Event log is source of truth.**
* History, trends, priority, tasks, care gaps, and ward state are projections.
* Replay to time T must reproduce state.
* Patient is the primary entity; room is context.
* No silent state mutation.
* Every important conclusion must link to evidence.
* Keep deterministic clinical logic outside React/prompts.

## Responsibility Boundaries

**Deterministic code:** events, baselines, deltas, trends, persistence, transient-vs-sustained patterns, priority, care gaps, deadlines, replay.
**Corti:** speech-to-text/Streams, FactsR/fact extraction, coding, text generation, agentic reasoning.
**MCP:** operational data/actions—staff, workload, availability, appointments, tasks.
**Human:** approval of workflow-changing actions.
Never let an LLM invent clinical truth.

## Corti

Clinical AI must use **Corti only**—no OpenAI/Anthropic/Gemini/Groq/Mistral.
Prefer official current Corti APIs/SDKs: Streams, FactsR, Medical Coding, Text Generation, Agentic Framework.
Keep secrets server-side.
If Corti fails, use a deterministic, clearly labeled fixture/demo adapter. Never fake live integration.

## MCP

Prioritize narrow tools for patient history/trend/priority/care gaps/tasks, staff availability/workload, appointments, and next available slots.
Proposal tools should prepare reassessments, appointments, handoffs, and escalation summaries.
Validate and log calls; no unrestricted DB access or silent writes.

> **AUTO-PREPARE, NOT AUTO-BOOK.**
> Workflow-changing actions require explicit human approval.

## Longitudinal Intelligence

Consider baseline, current/previous values, delta, direction, rate, duration, persistence, repeated observations, multi-signal agreement, conversation evidence, missing data, recovery, and noise.
Support: `stable | improving | temporary spike | watch | persistent concern | high priority | emergency`.
No mysterious AI risk score—priority must expose reasons/evidence.

## Care Gaps

A care gap exists when **patient state changes faster than workflow responds**.
Detect deterministic/evidence-backed cases: missing reassessment, unassigned/overdue tasks, unreviewed results, missing clinician review, or priority rising without coordination.

## Signature UX

Every escalation must answer:

* **What changed?**
* **Why does it matter?**
* **Why now?**
* **Why not earlier?**
* **What evidence supports it?**
  Also show meaningful changes since last round and the prepared next operational action.

## Demo/UI

Polish: `/ward` → `/patients/[patientId]` → `/simulation` → replay.
UI should feel like a premium clinical command center: calm, dense, evidence-first, excellent typography, restrained status colors.
Avoid generic dashboards, excessive cards/gradients, chatbot-first UX, and decorative complexity.

## Deterministic Demo

Use clearly labeled synthetic data.
Required scenarios:

1. gradual deterioration → #1 priority
2. transient spike → resolves without escalation
3. stable patient → overdue care task
4. improving patient
5. sudden emergency
   Use deterministic simulation time and presenter-safe reset; no randomness in the golden path.

## Golden Flow

Stable ward → normal nurse check → Corti captures observation → history updates → no premature alert → advance time/vitals → transient case stays un-escalated → main patient persists/worsens → #1 priority → Why Now/Not Earlier → care gap → MCP checks staff/slots → prepares reassessment/review/handoff → human approves → action becomes timeline event → replay earlier state.

## Reliability & Safety

Core demo must work without random external dependencies.
No console errors, broken loading, hydration warnings, race-dependent steps, or duplicate retry actions.
Never expose secrets/tokens, commit `.env`, imply synthetic patients are real, invent facts, or silently execute workflow-changing actions.

## Testing

Verify transient spikes don't escalate; persistent deterioration does; history/evidence persist; care gaps work; unavailable staff/slots degrade gracefully; approval is required and creates an event; replay/reset are deterministic; Corti fallback works; MCP rejects invalid calls; retries don't duplicate actions.
Run existing project `typecheck`, `test`, `lint`, and `build` scripts.

## Agent Work Rules

Before editing: read repo docs/code and nested `AGENTS.md`/`AGENTS.override.md`; understand current behavior/tests.
Make the **smallest high-impact change**.
Reuse architecture, integrate early, test continuously, avoid rewrites/scope creep.
Prioritize P0 demo blockers, then P1 judge-impact improvements.
Parallelize independent domains only; never have workers edit the same files concurrently.

## Time Pressure

**KEEP:** automatic documentation, history, trends/persistence, attention queue, Why Now, care gaps, Corti, evidence, MCP coordination, human approval, deterministic demo, production reliability.
**CUT:** 3D maps, complex auth/analytics/ML, unnecessary integrations, extra chat, decorative agents, secondary pages.

> **One excellent workflow beats many unfinished features.**
> **ECHO remembers the patient's trajectory and closes the care loop.**
