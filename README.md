# ECHO
Smart hospital ward. Three rooms, two live signals each, dispatch to whoever is free.

The ward already has monitors for pulse and pressure. We built the monitor for the one
signal nobody instruments, and everything it knows, it can quote.

## What it does
Ambient speech is the only source of judgement. Every room carries a Patient State and a
Coordination State. Yellow and red always trace back to a quote, a speaker and a timestamp.
Tasks derived from what was said are scored deterministically and offered to whoever is
free; if she declines or the offer times out, the task travels to the next nurse.
The agent proposes. A human confirms by voice.

## Run
cp .env.example .env      fill Corti credentials
npm install
npm run dev               pipeline + server
npm run replay            deterministic playback of fixtures/events/demo.jsonl

## Repo
docs/SPEC.md        what we are building and why
docs/CONTRACTS.md   the event log and every projection
docs/LANES.md       who owns what
docs/DEMO.md        the timed run sheet
ATTRIBUTIONS.md     everything external we used

## Team
Team name, number, four members and roles.
