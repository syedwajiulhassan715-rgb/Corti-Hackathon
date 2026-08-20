# ECHO

Smart hospital ward. Three rooms, two live signals each, dispatch to whoever is free.
Full spec in docs/SPEC.md. Types in docs/CONTRACTS.md. Read them before proposing design.

## Stack
TypeScript strict, Node. src/ and web/ only. eval/ is Python and never touches the demo path.

## Product law
Nothing enters state without a quote, speaker and timestamp.
Yellow or red requires at least one speech event in its evidence. Numbers corroborate, never conclude.
Fact extraction proposes candidates. Speaker-attributed segments decide.
Deterministic scoring, agent proposes, human confirms by voice.
Nothing a human accepted is silently reassigned.
A planned thing nobody discussed becomes a flag with the question to ask, never a guess.

## Architecture law
The event log is the only interface between modules. No module reads another's state.
engines/ and projections/ are pure functions from events. No network, no stored state.
engines/rules/ is data, not logic. Threshold changes touch no code.
engines/ and projections/ take `now` as an argument, never read it. Only main.ts and
server/index.ts call Date.now().
Every state change emits an event. Replay to T reproduces T exactly.

## API law
Never guess Corti field names. Check .claude/skills/corti-api or ask. Unknown field means stop.
Every Corti response caches to disk on first call and replays offline.

## Test law
No stage lands without an offline fixture that exercises it. Test first.
A failing stage degrades to a missing card, never a crash.

## Decision law
Winning probability = Impact x Novelty x Clarity x Technical Credibility x Demo Reliability.
Multiplicative, fix the weakest. Demo reliability is weakest.
Protect the demo, then the magic moment, then judge-visible value, then risk, then polish.
Label recommendations MUST / NICE / KILL. Recommend killing work rather than accommodating it.

## Honesty law
If something is faked, say so in code and on stage. Fake the environment, never the Corti path.

## Discipline
Vertical slice before breadth. No premature abstraction. No refactor after Friday midday.
