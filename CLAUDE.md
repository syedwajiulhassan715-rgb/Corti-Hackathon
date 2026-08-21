# ECHO

Longitudinal ward intelligence. The nurse's normal work becomes a patient's
history automatically; a trend engine watches that history for persistent
change; a priority engine ranks who needs attention; a Corti agent proposes the
next action and a human approves it.

Full spec in docs/SPEC.md. Types in docs/CONTRACTS.md. Corti API facts in
.claude/skills/corti-api/SKILL.md. Read them before proposing design.

## Stack
TypeScript strict, Node. src/ for the domain, web/ for the Next.js App Router
UI (static export, served by the existing Node server). eval/ is Python and
never touches the demo path.

## Product law
The patient is the primary entity. Every event carries a patientId.
Nothing enters state without a quote, speaker and timestamp.
Escalation above WATCH requires a speech event in its evidence, OR multi-signal
  numeric agreement that has persisted over time. A single reading never
  concludes. Numbers may corroborate; numbers in agreement, over time, may also
  conclude.
The system waits for sufficient evidence. One observation becomes history, not
  an alert. Only defined emergency conditions skip the ladder.
Baseline is per patient, never population.
Fact extraction proposes candidates. Speaker-attributed segments decide.
Deterministic scoring, agent proposes, human confirms.
Nothing a human accepted is silently reassigned.
A planned thing nobody discussed becomes a flag with the question to ask,
  never a guess.
Silence is a signal. A missing observation is a trend, not the absence of one.

## Architecture law
The event log is the only interface between modules. No module reads another's
  state.
engines/ and projections/ are pure functions from events. No network, no stored
  state.
engines/rules/ is data, not logic. Threshold changes touch no code.
engines/ and projections/ take `now` as an argument, never read it. Only
  main.ts and server/index.ts call Date.now().
Every state change emits an event. Replay to T reproduces T exactly.
The agent never decides clinical truth. It decides workflow only.

## API law
Never guess Corti field names. Check .claude/skills/corti-api/SKILL.md or probe
  and record the result there. Unknown field means stop.
/v2/tools/facts/ and /v2/tools/generate/ are 403 on this tenant. All fact and
  generation work is interaction-scoped.
Every Corti response caches to disk on first call and replays offline.
No other AI provider on the clinical path.

## Test law
No stage lands without an offline fixture that exercises it. Test first.
A failing stage degrades to a missing card, never a crash.
The acceptance scenario in SPEC.md runs as an automated test.

## Decision law
Winning probability = Impact x Novelty x Clarity x Technical Credibility x
  Demo Reliability. Multiplicative, fix the weakest.
Protect the demo, then the magic moment, then judge-visible value, then risk,
  then polish.
Label recommendations MUST / NICE / KILL. Recommend killing work rather than
  accommodating it.

## Honesty law
If something is faked, say so in code and on stage. Fake the environment, never
the Corti path. The monitor is simulated and labelled. The bed assignment is
hardcoded and labelled. The Corti calls are real.

## Discipline
Vertical slice before breadth. No premature abstraction. Get the end-to-end
loop working before polishing any screen.
