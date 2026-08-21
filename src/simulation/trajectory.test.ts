// Tests for the forward-simulator. Written before wiring it into main.ts.
//
// What matters most, in order: elena_petrova's acceptance-ladder numbers are
// exact (SPEC.md's acceptance test depends on them byte-for-byte), the
// simulator never invents a starting value it was not given, and two runs
// from the same inputs are identical — no randomness, no clock.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildTrajectory, elenaPetrovaAcceptanceLadder, TRAJECTORY_SHAPES, DEFAULT_STEP_MS } from "./trajectory.ts";

const ROOM = "room-02";
const T = 1_000_000_000;

function series(events: readonly { observation: string; value: unknown }[], observation: string) {
  return events.filter((e) => e.observation === observation).map((e) => e.value);
}

// ------------------------------------------------------------- the law

test("trajectory.ts never calls Date.now or Math.random", () => {
  const source = readFileSync(new URL("./trajectory.ts", import.meta.url), "utf8");
  const codeLines = source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line));
  assert.ok(!codeLines.some((l) => l.includes("Date.now(")), "must not read the wall clock");
  assert.ok(!codeLines.some((l) => l.includes("Math.random(")), "must not roll dice");
});

test("every declared shape has a delta table (or is elena's literal override)", () => {
  for (const shape of TRAJECTORY_SHAPES) {
    const events = buildTrajectory(shape, "some_patient", { systolic_bp: 120, diastolic_bp: 80, heart_rate: 70, spo2: 98, respiratory_rate: 16 }, ROOM, T);
    assert.ok(events.length > 0, `${shape} produced no events from a full baseline`);
  }
});

// ------------------------------------------------ the acceptance ladder

test("elena_petrova's ladder matches SPEC.md's acceptance test exactly", () => {
  const events = elenaPetrovaAcceptanceLadder(ROOM, T);

  assert.deepEqual(series(events, "systolic_bp"), [132, 142, 151, 159]);
  assert.deepEqual(series(events, "diastolic_bp"), [82, 88, 93, 97]);
  assert.deepEqual(series(events, "heart_rate"), [80, 87, 95, 104]);
  assert.deepEqual(series(events, "spo2"), [98, 96, 94, 92]);
});

test("requesting gradual-hypertension for elena_petrova returns the literal ladder, not the generic delta table", () => {
  const viaShape = buildTrajectory(
    "gradual-hypertension",
    "elena_petrova",
    { systolic_bp: 999, diastolic_bp: 999, heart_rate: 999, spo2: 1 }, // deliberately wrong baseline
    ROOM,
    T,
  );
  const direct = elenaPetrovaAcceptanceLadder(ROOM, T);
  assert.deepEqual(viaShape, direct);
  // The baseline was ignored entirely — the ladder's first value is 132,
  // not 999 + a delta.
  assert.equal(series(viaShape, "systolic_bp")[0], 132);
});

test("elena's ladder steps are DEFAULT_STEP_MS apart, starting one step after startTs", () => {
  const events = elenaPetrovaAcceptanceLadder(ROOM, T);
  const ts = series(events, "systolic_bp").length; // sanity: 4 points
  assert.equal(ts, 4);
  const timestamps = events.filter((e) => e.observation === "systolic_bp").map((e) => e.ts);
  assert.deepEqual(timestamps, [T + DEFAULT_STEP_MS, T + 2 * DEFAULT_STEP_MS, T + 3 * DEFAULT_STEP_MS, T + 4 * DEFAULT_STEP_MS]);
});

// --------------------------------------------------------- other shapes

test("stable holds every value flat across all three steps", () => {
  const baseline = { systolic_bp: 120, diastolic_bp: 78, heart_rate: 70, spo2: 98 };
  const events = buildTrajectory("stable", "some_patient", baseline, ROOM, T);

  assert.deepEqual(series(events, "systolic_bp"), [120, 120, 120]);
  assert.deepEqual(series(events, "heart_rate"), [70, 70, 70]);
});

test("gradual-respiratory-deterioration only projects observations the baseline actually has", () => {
  const baseline = { respiratory_rate: 16 }; // no spo2, no heart_rate supplied
  const events = buildTrajectory("gradual-respiratory-deterioration", "some_patient", baseline, ROOM, T);

  assert.ok(events.every((e) => e.observation === "respiratory_rate"), "must not invent spo2 or heart_rate from nothing");
  assert.deepEqual(series(events, "respiratory_rate"), [19, 22, 26]);
});

test("sudden-emergency is a single step, not a ladder", () => {
  const baseline = { spo2: 96, heart_rate: 88, systolic_bp: 118, respiratory_rate: 18 };
  const events = buildTrajectory("sudden-emergency", "some_patient", baseline, ROOM, T);

  assert.equal(series(events, "spo2").length, 1);
  assert.equal(series(events, "spo2")[0], 86);
});

test("an empty baseline projects nothing — never invent a starting value", () => {
  const events = buildTrajectory("gradual-hypertension", "some_patient", {}, ROOM, T);
  assert.deepEqual(events, []);
});

// ------------------------------------------------------ event shape

test("every event is a well-formed feed-shaped EventInput", () => {
  const events = buildTrajectory("improving", "aisha_rahman", { systolic_bp: 118, diastolic_bp: 76, heart_rate: 72, spo2: 99 }, "room-03", T);
  for (const e of events) {
    assert.equal(e.patientId, "aisha_rahman");
    assert.equal(e.room, "room-03");
    assert.equal(e.source, "vital");
    assert.equal(e.speaker, "unknown");
    assert.equal(e.quote, "");
    assert.equal(e.code, null);
  }
});

// -------------------------------------------------------- determinism

test("building the same trajectory twice is byte-identical", () => {
  const baseline = { systolic_bp: 118, diastolic_bp: 76, heart_rate: 72, spo2: 99, respiratory_rate: 16 };
  const first = buildTrajectory("gradual-respiratory-deterioration", "test_patient", baseline, ROOM, T);
  const second = buildTrajectory("gradual-respiratory-deterioration", "test_patient", baseline, ROOM, T);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("elena's ladder is byte-identical across two calls", () => {
  const first = elenaPetrovaAcceptanceLadder(ROOM, T);
  const second = elenaPetrovaAcceptanceLadder(ROOM, T);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
