// THE ACCEPTANCE TEST. docs/SPEC.md "Acceptance test", executable.
//
// Five modules were built in parallel against a shared contract and each one
// passed its own tests in isolation. That proves nothing about whether they
// compose. This file is the only place the whole chain runs end to end:
//
//   chart + trajectory -> EventLog -> patientHistory -> patientTrend
//                                  -> prioritize -> the ladder
//
// It is deliberately written against the PUBLIC exports only, the same way the
// server and the UI will call them. If this file needs a module's internals to
// pass, the seam between two workstreams is in the wrong place.
//
// WHAT IT IS REALLY ASSERTING, and why the negative half matters more:
// anyone can make a system escalate. The product claim is that ECHO waits —
// that it climbs only as evidence accumulates and refuses to conclude from a
// single reading. So the "does NOT escalate yet" assertions below are load
// bearing, not padding. If they ever start passing trivially because the
// engine escalates everything, the demo is a lie and this test is the thing
// that says so.

import { test } from "node:test";
import assert from "node:assert/strict";

import { EventLog } from "./log/store.ts";
import { patientHistory } from "./projections/patientHistory.ts";
import { patientTrend } from "./engines/patientTrend.ts";
import { prioritize } from "./engines/prioritization.ts";
import { elenaPetrovaAcceptanceLadder } from "./simulation/trajectory.ts";
import { loadRecord, ALL_PATIENTS, ROOM_PATIENTS } from "./world/patients.ts";
import { wardEvents } from "./simulation/ward.ts";
import type { PatientPriorityInput } from "./engines/prioritization.ts";
import type { Event, PatientPriority, PriorityLevel } from "./contracts/index.ts";

const PATIENT = "elena_petrova";
const ROOM = "room-02";
const HOUR = 3_600_000;

/** Offset zero for the scripted ladder. A literal, so the run is reproducible. */
const T0 = 1_787_212_800_000;
const STEP = 6 * HOUR;

/**
 * Run the whole chain for one patient at one moment.
 *
 * This is exactly what server/index.ts will do per request, which is the
 * point: if the composition is awkward here it will be awkward there.
 */
function fold(events: readonly Event[], now: number): PatientPriority {
  const record = loadRecord(PATIENT);
  const history = patientHistory(events, record, now);
  assert.ok(history, "history must exist for a patient with a real chart");

  const trends = patientTrend(history, now);
  const input: PatientPriorityInput = {
    patientId: PATIENT,
    trends,
    history,
    previousLevel: null,
  };
  const [priority] = prioritize([input], now);
  assert.ok(priority, "prioritize must return a row for every input");
  return priority;
}

/** The scripted deterioration, as events in a log. */
function ladderLog(): readonly Event[] {
  const log = new EventLog();
  for (const input of elenaPetrovaAcceptanceLadder(ROOM, T0, STEP)) {
    log.append(input);
  }
  return log.all();
}

// ------------------------------------------------------- the ladder climbs

test("SPEC acceptance: the patient climbs the ladder only as evidence accumulates", () => {
  const events = ladderLog();

  // One reading in. A single observation becomes history, not an alert —
  // this is the product law that separates ECHO from a threshold alarm.
  const afterFirst = fold(events, T0 + STEP);
  assert.ok(
    severity(afterFirst.level) <= severity("WATCH"),
    `one reading must not escalate above WATCH, got ${afterFirst.level}`,
  );

  // Everything in. Multiple signals have agreed, over time.
  const afterAll = fold(events, T0 + 4 * STEP);
  assert.ok(
    severity(afterAll.level) > severity("WATCH"),
    `four corroborating readings over ${(3 * STEP) / HOUR}h must escalate above ` +
      `WATCH, got ${afterAll.level}`,
  );

  // The direction of travel is the claim. Assert the climb, not a literal
  // rung: the rung is a threshold in priority.rules.ts and the doctor is
  // meant to be able to retune it without breaking this test.
  assert.ok(
    severity(afterAll.level) > severity(afterFirst.level),
    "the ladder must climb as evidence accumulates",
  );
});

test("the climb is driven by numbers agreeing over time, with no speech at all", () => {
  const events = ladderLog();
  assert.equal(
    events.filter((e) => e.source === "speech").length,
    0,
    "this scenario deliberately contains no utterances",
  );

  const priority = fold(events, T0 + 4 * STEP);

  // v2 product law (DECISIONS D11): numbers in AGREEMENT, over TIME, may
  // conclude. Under the v1 law this case was unreportable, and it is exactly
  // the case the pivot exists to catch.
  assert.ok(
    severity(priority.level) > severity("WATCH"),
    "multi-signal agreement over time must be able to escalate without speech",
  );
  const trends = patientTrend(
    patientHistory(ladderLog(), loadRecord(PATIENT), T0 + 4 * STEP)!,
    T0 + 4 * STEP,
  );
  assert.ok(
    trends.agreementCount >= 2,
    `escalation without speech requires corroboration, got agreementCount ` +
      `${trends.agreementCount}`,
  );
  assert.ok(trends.persistenceMs > 0, "and it must have persisted");
});

// ------------------------------------------------------------- the receipt

test("every priority decomposes into components that cite evidence", () => {
  const priority = fold(ladderLog(), T0 + 4 * STEP);

  assert.ok(priority.components.length > 0, "a priority with no receipt is a black box");

  const sum = priority.components.reduce((total, c) => total + c.points, 0);
  assert.equal(priority.score, sum, "score must equal the sum of its components");

  for (const component of priority.components) {
    assert.ok(component.explanation.trim() !== "", `${component.name} has no explanation`);
  }

  // The product law, at the end of the chain rather than at the start: a
  // claim that cannot name the events behind it does not get shown.
  assert.ok(
    priority.evidenceEventIds.length > 0,
    "an escalated patient must cite the events that escalated them",
  );
  const known = new Set(ladderLog().map((e) => e.id));
  for (const id of priority.evidenceEventIds) {
    assert.ok(known.has(id), `cited event ${id} is not in the log`);
  }
});

// ---------------------------------------------------------------- the ward

test("the whole ward folds, and ranking is deterministic across runs", () => {
  const now = T0 + 4 * STEP;

  function wardOnce(): readonly PatientPriority[] {
    const log = new EventLog();
    for (const input of wardEvents({ startTs: T0, stepMs: STEP })) log.append(input);
    const events = log.all();
    const inputs: PatientPriorityInput[] = [];
    for (const slug of ALL_PATIENTS) {
      const history = patientHistory(events, loadRecord(slug), now);
      if (history === undefined) continue;
      inputs.push({
        patientId: slug,
        trends: patientTrend(history, now),
        history,
        previousLevel: null,
      });
    }
    return prioritize(inputs, now);
  }

  const first = wardOnce();
  const second = wardOnce();

  assert.equal(first.length, ALL_PATIENTS.length, "every provided chart must fold");
  assert.deepEqual(
    first.map((p) => [p.patientId, p.rank, p.level, p.score]),
    second.map((p) => [p.patientId, p.rank, p.level, p.score]),
    "replay must reproduce the ward exactly — a jury will ask us to run it twice",
  );

  // Ranks are a total order over the ward: 1..n, no gaps, no duplicates.
  assert.deepEqual(
    [...first].map((p) => p.rank).sort((a, b) => a - b),
    Array.from({ length: first.length }, (_, i) => i + 1),
    "rank must be a dense total order",
  );

  // The ward must discriminate. If everyone escalates, the queue is noise and
  // the product does not work — this is the "declines to escalate" property
  // that SPEC.md calls the reason room-03 exists.
  const escalated = first.filter((p) => severity(p.level) > severity("WATCH"));
  assert.ok(
    escalated.length < first.length,
    "a ward where every patient is escalated is a ward nobody reads",
  );
});

test("room-to-patient assignment covers every provided chart, and is 1:1", () => {
  const assigned = Object.values(ROOM_PATIENTS);
  assert.equal(new Set(assigned).size, assigned.length, "two patients share a bed");
  for (const slug of ALL_PATIENTS) {
    assert.ok(assigned.includes(slug), `${slug} has no bed`);
  }
});

// ----------------------------------------------------------------- helpers

const RUNGS: readonly PriorityLevel[] = [
  "GREEN",
  "WATCH",
  "PERSISTING_CONCERN",
  "HIGH",
  "CRITICAL",
];

function severity(level: PriorityLevel): number {
  return RUNGS.indexOf(level);
}

// ------------------------------------------------------------- the demo run

// The five-minute stage sequence (docs/SPEC.md), asserted as a sequence rather
// than as a set of independent moments. Each advance must leave the patient at
// least where the last one did and end higher than it started — that is the
// whole "waits for evidence, then concludes" claim, and it is the thing a
// judge is actually watching.
test("the demo ward climbs monotonically over the scripted advances", () => {
  const log = new EventLog();
  for (const input of wardEvents({ startTs: T0, stepMs: STEP })) log.append(input);
  const events = log.all();

  const seen: PriorityLevel[] = [];
  for (let step = 1; step <= 4; step += 1) {
    const now = T0 + step * STEP;
    const history = patientHistory(events, loadRecord(PATIENT), now);
    assert.ok(history);
    const [priority] = prioritize(
      [{ patientId: PATIENT, trends: patientTrend(history, now), history, previousLevel: null }],
      now,
    );
    seen.push(priority!.level);
  }

  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(
      severity(seen[i]!) >= severity(seen[i - 1]!),
      `the demo must never walk backwards on stage: ${seen.join(" -> ")}`,
    );
  }
  assert.ok(
    severity(seen.at(-1)!) > severity(seen[0]!),
    `the demo must end higher than it began: ${seen.join(" -> ")}`,
  );
  assert.ok(
    severity(seen[0]!) <= severity("WATCH"),
    `and it must begin calm, not already escalated: ${seen[0]}`,
  );
});
