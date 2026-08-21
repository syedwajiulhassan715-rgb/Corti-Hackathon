# ECHO — Every Clinical Observation

> Most clinical systems remember events. ECHO remembers trajectories.

ECHO turns routine nursing observations into an append-only patient history,
detects persistent multi-signal deterioration, ranks the ward with explicit
evidence, identifies care gaps, prepares constrained operational actions, and
waits for human approval.

All included patients, device readings, staff availability, and appointment
slots are synthetic demo fixtures. Corti is the only clinical AI provider;
when it is unavailable, the app uses a clearly labelled deterministic fallback.

## Run the complete demo

Requires Node.js 22 or newer.

```text
npm install
npm run verify
npm start
```

Open `http://localhost:8787/ward/`. Use Reset before every rehearsal. The
scripted path advances from a calm ward through persistent deterioration,
care-gap detection, resource preparation, human approval, and exact replay.

## Core routes

- `/ward/` — attention queue, selected patient, replay, and presenter controls
- `/patients/elena_petrova/` — standalone longitudinal patient view
- `/health` — process health and event count

## Architecture

The event log is the source of truth. Patient history, trends, priority, care
gaps, proposals, and actions are replayable projections. Deterministic code
decides clinical state; Corti extracts and explains; narrow coordination tools
prepare workflow; humans approve changes.

See [docs/SPEC.md](docs/SPEC.md), [docs/DECISIONS.md](docs/DECISIONS.md), and
[docs/LANES.md](docs/LANES.md).
