# ECHO

## Problem
A ward runs two disconnected systems: a plan view of what should happen, and an alarm
view that fires when a number crosses a threshold. Neither knows what happened in the
room. A patient says he is more breathless than yesterday; a fraction reaches the record
and nothing reaches the overview. Meanwhile tasks stall silently. A blood test ordered
but never booked. A result available but never reviewed. Nobody tracks the gap between
what was planned and what was done.

## Anchor
For a ward where nobody can see the whole floor at once, we turn what is said in the
rooms into two live signals per patient, one for their condition and one for whether
their care is actually moving, and dispatch every resulting task to whoever is free.

## Stage line
The ward already has monitors for pulse and pressure. We built the monitor for the one
signal nobody instruments, and everything it knows, it can quote.

## Two signals
PATIENT STATE       green stable, yellow changed and should be checked, red urgent
COORDINATION STATE  green moving, yellow missing or delayed, red unreviewed or badly late
Each carries one plain line of explanation. Behind that line sits the quote, speaker,
timestamp and code. The split separates "the patient changed" from "the system failed".
No existing ward view does this. It is the core idea.

## Inputs
Speech is the only source of judgement: conversations, bedside checks, handover, family.
Vitals, NEWS/TOKS, labs, pain scores, movements, orders and results are simulated feeds
that give the ward body. A number moving with nobody speaking is a yellow prompt to go
and ask, never a red conclusion.

## Chain
S0  Capture         ambient STT, diarize true
S1  Roles           speaker slots to clinician / patient / nurse
S2  Candidates      fact extraction, topics only
S3  Grounding       no attributed segment, no fact
S4  Coding          three phrasings by three speakers become one signal
S5  Patient State   deterministic rules over grounded coded facts, corroborated by feeds
S6  Coordination    task stage ladder: ordered, taken, resulted, reviewed, acted
S7  Task memory     persists until closed, with reason, owner, urgency, due, delay
S8  Scoring         urgency, wait, dependency, fit. Doctor's weights.
S9  Dispatch        offer, timeout, decline, reassign, escalate, preempt with requeue
S10 Scheduling      agent fits ranked queue into scarce slots, human books
S11 Generation      24h summary, explanations, escalation packets
S12 Confirm         dictation, human voice approves, logged in their words

## Deterministic vs agentic
Engines, not agents: Patient State, Coordination, task memory, scoring, ward-round order.
Doctor's rules, every output explainable.
Genuinely agentic: dispatch matching tasks to free people, slot matching against scarcity.
Q&A sentence: deterministic scoring, agent proposes the fit, human decides, every step
cites a quote.

## 24-hour summary
Three questions only: what changed, what was done, what still needs to happen.
Every claim carries evidence. Nothing in the summary that is not in the log.
projections/summary24 assembles the input, corti/generate produces the text. The
projection decides what is true; generation decides only how it reads.

## Ward round order
Fixed ladder, doctor's: urgent, deteriorating, waiting on urgent result, dischargeable
but for one blocker, stable with open tasks, stable and clear. A table lookup, say so.

## Product areas, all load-bearing
Ambient STT is the only sensory organ. Coding connects comments hours apart by different
speakers. Generation writes summary, explanations and packets. Agentic dispatches and
schedules. Dictation closes every action. Remove Corti and this is a dead map.

## Build order
Patient State before Coordination. Dispatcher before scheduler. Never let one depend on
another, so any can be cut at freeze with the story intact.

## Scope
MUST  S0-S7, both signals with explanation and evidence, three rooms, dispatcher with
      offer, timeout, decline, reassignment, voice confirm, playback scrub, eval table
NICE  score components visible, slot matching, preemption with requeue, occupancy from
      active sessions, 24h summary, ward-round order
KILL  booking without human confirm, learned scores, a second scarce resource, live mic,
      a second rehearsed scenario, any state change without an utterance behind it

## Gates
+30m    contracts locked, doctor starts rule table
Hour 1  V1-V3 answered in VALIDATION.md
14:00   one conversation, real pipeline, one room changes state, quote visible on real UI
22:00   both signals, dispatch with reassignment, voice confirm, all off the log
Fri 12  freeze, then three timed rehearsals.
