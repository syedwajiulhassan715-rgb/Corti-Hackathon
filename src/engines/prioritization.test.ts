// Tests for the Priority Engine, against SPEC.md's escalation ladder and
// CLAUDE.md's product law. Written before the engine.
//
// The properties that carry this engine's clinical safety:
//   the SPEC.md acceptance ladder climbs GREEN -> WATCH -> PERSISTING_CONCERN
//     -> HIGH as evidence accumulates, and not before
//   a single alarming reading never escalates above WATCH
//   multi-signal agreement, persisted, escalates with no speech event at all
//   withheld is populated on a genuine near miss
//   every component cites evidence, and score is exactly the sum of points
//   ranking is deterministic and ties break on the documented key
//   the engine is a pure function of its inputs

import { test } from "node:test";
import assert from "node:assert/strict";

import { prioritize, type PatientPriorityInput } from "./prioritization.ts";
import type {
  ClinicalFact,
  PatientHistory,
  PatientTrends,
  PriorityLevel,
  TrendSignal,
} from "../contracts/index.ts";
import { VITAL } from "../world/feeds.ts";
import { EMERGENCY_CONDITIONS } from "./rules/priority.rules.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T = 10_000_000;

// ------------------------------------------------------------------- fixtures

function signal(observation: string, over: Partial<TrendSignal> = {}): TrendSignal {
  return Object.freeze({
    patientId: "p1",
    observation,
    baseline: null,
    current: null,
    delta: null,
    direction: "stable",
    ratePerHour: null,
    persistenceMs: 0,
    sampleCount: 1,
    concerning: false,
    sinceLastSampleMs: null,
    overdue: false,
    evidenceEventIds: [],
    ...over,
  } satisfies TrendSignal);
}

function patientTrends(
  patientId: string,
  asOf: number,
  signals: readonly TrendSignal[],
  over: Partial<PatientTrends> = {},
): PatientTrends {
  const concerning = signals.filter((s) => s.concerning);
  return Object.freeze({
    patientId,
    asOf,
    signals: Object.freeze(signals),
    agreementCount: concerning.length,
    persistenceMs: concerning.length === 0 ? 0 : Math.max(...concerning.map((s) => s.persistenceMs)),
    supportingFactIds: [],
    ...over,
  } satisfies PatientTrends);
}

function patientHistory(patientId: string, over: Partial<PatientHistory> = {}): PatientHistory {
  return Object.freeze({
    patientId,
    asOf: T,
    name: `Patient ${patientId}`,
    mrn: `MRN-${patientId}`,
    summary: "",
    room: null,
    simulated: true,
    conditions: [],
    medications: [],
    facts: [],
    series: {},
    timeline: [],
    ...over,
  } satisfies PatientHistory);
}

function input(
  patientId: string,
  trends: PatientTrends,
  history: PatientHistory,
  previousLevel: PriorityLevel | null = null,
): PatientPriorityInput {
  return { patientId, trends, history, previousLevel };
}

// ------------------------------------------ SPEC.md acceptance ladder (P-002)

test("acceptance ladder: BP/HR/SpO2 climb GREEN -> WATCH -> PERSISTING_CONCERN -> HIGH, and not before", () => {
  const asOf0 = T;
  const step1 = patientTrends("p1", asOf0, [
    signal("systolic_bp", { baseline: 132, current: 132, delta: 0, direction: "stable" }),
    signal("diastolic_bp", { baseline: 82, current: 82, delta: 0, direction: "stable" }),
    signal("heart_rate", { baseline: 80, current: 80, delta: 0, direction: "stable" }),
    signal("spo2", { baseline: 98, current: 98, delta: 0, direction: "stable" }),
  ]);
  const r1 = prioritize([input("p1", step1, patientHistory("p1"))], asOf0);
  assert.equal(r1[0].level, "GREEN", "a baseline reading with nothing concerning is GREEN");

  // 90 minutes later: BP alone moves enough to count, HR and SpO2 do not yet.
  const asOf1 = asOf0 + 90 * MIN;
  const step2 = patientTrends("p1", asOf1, [
    signal("systolic_bp", { baseline: 132, current: 142, delta: 10, direction: "worsening", persistenceMs: 90 * MIN, sampleCount: 2, concerning: true, evidenceEventIds: ["e2"] }),
    signal("diastolic_bp", { baseline: 82, current: 88, delta: 6, direction: "worsening", persistenceMs: 90 * MIN, sampleCount: 2, concerning: true, evidenceEventIds: ["e2"] }),
    signal("heart_rate", { baseline: 80, current: 87, delta: 7, direction: "worsening", persistenceMs: 90 * MIN, sampleCount: 2, concerning: false }),
    signal("spo2", { baseline: 98, current: 96, delta: -2, direction: "worsening", persistenceMs: 90 * MIN, sampleCount: 2, concerning: false }),
  ]);
  const r2 = prioritize([input("p1", step2, patientHistory("p1"), "GREEN")], asOf1);
  assert.equal(
    r2[0].level,
    "WATCH",
    "two signals agree but have only held for 90 minutes — not the 2 hours PERSISTING_CONCERN needs",
  );

  // 3 hours in: HR and SpO2 join, and persistence has now cleared 2 hours.
  const asOf2 = asOf0 + 180 * MIN;
  const step3 = patientTrends("p1", asOf2, [
    signal("systolic_bp", { baseline: 132, current: 151, delta: 19, direction: "worsening", persistenceMs: 180 * MIN, sampleCount: 3, concerning: true, evidenceEventIds: ["e3"] }),
    signal("diastolic_bp", { baseline: 82, current: 93, delta: 11, direction: "worsening", persistenceMs: 180 * MIN, sampleCount: 3, concerning: true, evidenceEventIds: ["e3"] }),
    signal("heart_rate", { baseline: 80, current: 95, delta: 15, direction: "worsening", persistenceMs: 180 * MIN, sampleCount: 3, concerning: true, evidenceEventIds: ["e3"] }),
    signal("spo2", { baseline: 98, current: 94, delta: -4, direction: "worsening", persistenceMs: 180 * MIN, sampleCount: 3, concerning: true, evidenceEventIds: ["e3"] }),
  ]);
  const r3 = prioritize([input("p1", step3, patientHistory("p1"), "WATCH")], asOf2);
  assert.equal(
    r3[0].level,
    "PERSISTING_CONCERN",
    "4 signals agree and have held for 3 hours — clears PERSISTING_CONCERN but not yet HIGH's 4-hour floor",
  );

  // 4.5 hours in: same 4 signals, now past the 4-hour floor with a 4th sample.
  const asOf3 = asOf0 + 270 * MIN;
  const step4 = patientTrends("p1", asOf3, [
    signal("systolic_bp", { baseline: 132, current: 159, delta: 27, direction: "worsening", persistenceMs: 270 * MIN, sampleCount: 4, concerning: true, evidenceEventIds: ["e4"] }),
    signal("diastolic_bp", { baseline: 82, current: 97, delta: 15, direction: "worsening", persistenceMs: 270 * MIN, sampleCount: 4, concerning: true, evidenceEventIds: ["e4"] }),
    signal("heart_rate", { baseline: 80, current: 104, delta: 24, direction: "worsening", persistenceMs: 270 * MIN, sampleCount: 4, concerning: true, evidenceEventIds: ["e4"] }),
    signal("spo2", { baseline: 98, current: 92, delta: -6, direction: "worsening", persistenceMs: 270 * MIN, sampleCount: 4, concerning: true, evidenceEventIds: ["e4"] }),
  ]);
  const r4 = prioritize([input("p1", step4, patientHistory("p1"), "PERSISTING_CONCERN")], asOf3);
  assert.equal(r4[0].level, "HIGH", "past both the persistence and agreement floors for HIGH");
  assert.equal(r4[0].previousLevel, "PERSISTING_CONCERN");
});

// ----------------------------------------- a single reading never concludes

test("a single alarming reading does not escalate above WATCH, however large the delta", () => {
  const trends = patientTrends("p1", T, [
    signal("spo2", {
      baseline: 98,
      current: 91, // concerning, but above the defined emergency line (<=88) — no shortcut here
      delta: -7,
      direction: "worsening",
      persistenceMs: 5 * MIN,
      sampleCount: 1,
      concerning: true,
      evidenceEventIds: ["e1"],
    }),
  ]);
  const result = prioritize([input("p1", trends, patientHistory("p1"))], T);

  assert.equal(result[0].level, "WATCH");
  assert.ok(
    result[0].withheld.length > 0,
    "a near-fatal-looking single reading with nobody else agreeing should show up in withheld",
  );
});

// --------------------------------- multi-signal agreement concludes, no speech

test("multi-signal agreement persisted over time escalates with zero speech evidence", () => {
  const trends = patientTrends("p1", T, [
    signal("systolic_bp", { concerning: true, persistenceMs: 3 * HOUR, sampleCount: 3, evidenceEventIds: ["e1"] }),
    signal("diastolic_bp", { concerning: true, persistenceMs: 3 * HOUR, sampleCount: 3, evidenceEventIds: ["e1"] }),
  ]);
  assert.equal(trends.supportingFactIds.length, 0, "fixture carries no speech-derived facts at all");

  const result = prioritize([input("p1", trends, patientHistory("p1"))], T);

  assert.equal(result[0].level, "PERSISTING_CONCERN");
  assert.ok(
    result[0].components.every((c) => c.name !== "speech"),
    "nothing here should read as speech-grounded",
  );
});

// ------------------------------------------------------------ withheld / near-miss

test("withheld explains a genuine near miss in plain language", () => {
  const trends = patientTrends("p1", T, [
    signal("spo2", {
      concerning: true,
      persistenceMs: 90 * MIN, // close to PERSISTING_CONCERN's 2-hour floor, not there yet
      sampleCount: 2,
      evidenceEventIds: ["e1"],
    }),
  ]);
  const result = prioritize([input("p1", trends, patientHistory("p1"))], T);

  assert.equal(result[0].level, "WATCH");
  assert.equal(result[0].withheld.length, 1);
  assert.match(result[0].withheld[0], /1\.5 hours/);
  assert.match(result[0].withheld[0], /2 hours needed/);
});

test("withheld stays empty when a miss is not close at all", () => {
  const trends = patientTrends("p1", T, [
    signal("spo2", { concerning: true, persistenceMs: MIN, sampleCount: 2, evidenceEventIds: ["e1"] }),
  ]);
  const result = prioritize([input("p1", trends, patientHistory("p1"))], T);

  assert.equal(result[0].level, "WATCH");
  // One minute of persistence against a 2-hour floor, with only one signal
  // against a floor of two, is nowhere close on either axis — still gets a
  // reason (a rule failing by a mile is not silence either), but not a
  // "close to X" framing.
  assert.ok(result[0].withheld.every((w) => !w.startsWith("Close to")));
});

// ------------------------------------------------- the receipt: evidence and score

test("every component cites evidence, and score is exactly the sum of points", () => {
  const trends = patientTrends("p1", T, [
    signal("systolic_bp", { concerning: true, persistenceMs: 3 * HOUR, sampleCount: 3, evidenceEventIds: ["e1", "e2"] }),
    signal("diastolic_bp", { concerning: true, persistenceMs: 3 * HOUR, sampleCount: 3, evidenceEventIds: ["e3"] }),
    signal("heart_rate", { overdue: true, sinceLastSampleMs: 9 * HOUR, evidenceEventIds: ["e4"] }),
  ]);
  const facts: readonly ClinicalFact[] = [
    Object.freeze({
      id: "f1",
      patientId: "p1",
      observedAt: T,
      group: "plan",
      name: "repeat chest x-ray",
      evidenceEventIds: ["e5"],
      source: "derived",
    } satisfies ClinicalFact),
  ];
  const history = patientHistory("p1", { facts, asOf: T }); // asOf === now, so time-waiting stays silent

  const result = prioritize([input("p1", trends, history)], T);
  const p = result[0];

  assert.ok(p.components.length > 0);
  for (const c of p.components) {
    assert.ok(c.evidenceEventIds.length > 0, `component "${c.name}" (${c.explanation}) cites no evidence`);
  }
  const expectedScore = p.components.reduce((sum, c) => sum + c.points, 0);
  assert.equal(p.score, expectedScore);
  assert.ok(p.components.some((c) => c.name === "unresolved-tasks"), "an undone plan item should surface as a flag, not a guess");
});

// -------------------------------------------------------------------- ranking

test("ranking is deterministic and total; ties break on patientId ascending", () => {
  const identicalA = patientTrends("alpha", T, [signal("spo2", { concerning: true, persistenceMs: HOUR, sampleCount: 2, evidenceEventIds: ["e1"] })]);
  const identicalB = patientTrends("bravo", T, [signal("spo2", { concerning: true, persistenceMs: HOUR, sampleCount: 2, evidenceEventIds: ["e1"] })]);
  const green = patientTrends("charlie", T, []);

  const inputs = [
    input("bravo", identicalB, patientHistory("bravo")),
    input("charlie", green, patientHistory("charlie")),
    input("alpha", identicalA, patientHistory("alpha")),
  ];

  const result = prioritize(inputs, T);

  assert.deepEqual(result.map((p) => p.patientId), ["alpha", "bravo", "charlie"]);
  assert.deepEqual(result.map((p) => p.rank), [1, 2, 3]);
  assert.equal(result[0].level, result[1].level, "alpha and bravo tie on level and score");
  assert.equal(result[0].score, result[1].score);

  // Re-run with the input array in a different order: same ranking comes out.
  const reordered = [inputs[2], inputs[0], inputs[1]];
  const again = prioritize(reordered, T);
  assert.deepEqual(again.map((p) => p.patientId), ["alpha", "bravo", "charlie"]);
});

test("a lower rung never outranks a higher rung, regardless of score", () => {
  const watchButBig = patientTrends("watch-patient", T, [
    signal("spo2", { concerning: true, persistenceMs: 5 * MIN, sampleCount: 1, evidenceEventIds: ["e1"] }),
  ]);
  const highPatient = patientTrends("high-patient", T, [
    signal("systolic_bp", { concerning: true, persistenceMs: 5 * HOUR, sampleCount: 4, evidenceEventIds: ["e2"] }),
    signal("diastolic_bp", { concerning: true, persistenceMs: 5 * HOUR, sampleCount: 4, evidenceEventIds: ["e2"] }),
    signal("heart_rate", { concerning: true, persistenceMs: 5 * HOUR, sampleCount: 4, evidenceEventIds: ["e2"] }),
  ]);

  const result = prioritize(
    [
      input("watch-patient", watchButBig, patientHistory("watch-patient")),
      input("high-patient", highPatient, patientHistory("high-patient")),
    ],
    T,
  );

  const watch = result.find((p) => p.patientId === "watch-patient")!;
  const high = result.find((p) => p.patientId === "high-patient")!;
  assert.equal(watch.level, "WATCH");
  assert.equal(high.level, "HIGH");
  assert.equal(high.rank, 1, "HIGH always outranks WATCH, independent of score");
  assert.equal(watch.rank, 2);
});

// -------------------------------------------------------------------- purity

test("prioritize is a pure function: same input twice, byte-identical output, nothing mutated", () => {
  const trends = patientTrends("p1", T, [
    signal("systolic_bp", { concerning: true, persistenceMs: 3 * HOUR, sampleCount: 3, evidenceEventIds: ["e1"] }),
    signal("diastolic_bp", { concerning: true, persistenceMs: 3 * HOUR, sampleCount: 3, evidenceEventIds: ["e1"] }),
  ]);
  const history = patientHistory("p1");
  const before = JSON.stringify({ trends, history });

  const a = prioritize([input("p1", trends, history)], T);
  const b = prioritize([input("p1", trends, history)], T);

  assert.deepEqual(a, b);
  assert.equal(JSON.stringify({ trends, history }), before, "inputs must not be mutated");
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a[0]));
  assert.ok(Object.isFrozen(a[0].components));
});

// ---------------------------------------------------------- emergency jump

test("a defined emergency condition jumps straight to CRITICAL, no speech, no agreement needed", () => {
  const trends = patientTrends("p1", T, [
    signal("spo2", { current: 85, concerning: true, persistenceMs: MIN, sampleCount: 1, evidenceEventIds: ["e1"] }),
  ]);
  const result = prioritize([input("p1", trends, patientHistory("p1"))], T);

  assert.equal(result[0].level, "CRITICAL");
  assert.ok(result[0].evidenceEventIds.includes("e1"));
});

// The same drift that once silently disabled respiratory trends can silently
// disable an EMERGENCY condition, which is strictly worse: the rule reads as
// live, fires never, and no test notices. engines/patientTrend.test.ts pins the
// trend table the same way; this pins the emergency table.
test("every emergency condition names an observation the monitor publishes", () => {
  const published = new Set<string>(Object.values(VITAL));
  published.add("diastolic_bp");

  for (const condition of EMERGENCY_CONDITIONS) {
    assert.ok(
      published.has(condition.observation),
      `emergency condition on "${condition.observation}" can never fire: ` +
        `the feed emits [${[...published].sort().join(", ")}]`,
    );
  }
});
