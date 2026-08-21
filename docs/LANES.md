# ECHO v2 delivery lanes

The event log is the interface. Patient history, trends, priority, care gaps,
proposals, and replay are projections of that log.

## Core domain

Owns contracts, event storage/replay, patient history, trend rules,
prioritization, care gaps, and proposal approval. Clinical conclusions remain
deterministic and evidence-backed. Current status: implemented and covered by
the acceptance suite.

## Corti

Owns authentication, streaming transcription, interactions, FactsR, coding,
and document generation. One interaction represents one nurse round. Live
calls degrade to clearly labelled deterministic fixtures when credentials or
tenant capabilities are unavailable. Current status: adapters, cached fixtures,
and offline fallback are implemented.

## Simulation and world

Owns the 11-patient synthetic ward, chart parsing, deterministic trajectories,
simulation clock, staff roster, and presenter-safe golden path. No random
values are allowed in the rehearsed flow. Current status: implemented.

## Product surface

Owns `/ward`, `/patients/[patientId]`, nurse-round capture, longitudinal
timeline, trends, Why Now / Why Not Earlier, care gaps, recommendations,
approval, and replay controls. The UI reads and writes only through the server
API; approvals and observations append events. Current status: core routes and
golden-flow controls implemented; visual rehearsal remains a release gate.

## Release and stage

Owns clean-machine startup, cached Corti fallback, projector-size QA, reset and
replay rehearsal, security review, and the five-minute run sheet. Release gate:
`npm run verify` plus a complete browser rehearsal of the acceptance story.

## Current ownership rule

Avoid concurrent edits to the same files. Prefer the smallest change that
closes the golden loop. Optional routes, analytics, advanced scheduling, live
microphone work, and decorative polish must not displace ward reliability.
