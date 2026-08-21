// Tests for the Trend Engine, written before the implementation.
//
// Numbers are the acceptance-test vitals from docs/SPEC.md:
//   BP 132/82 -> 142/88 -> 151/93 -> 159/97
//   HR 80 -> 87 -> 95 -> 104
//   SpO2 98 -> 96 -> 94 -> 92
//
// Properties that carry the product claim, per CLAUDE.md and docs/SPEC.md:
//   a rising systolic BP series is worsening, with correct delta and persistence
//   one sample concludes nothing, ever
//   a flat series is stable
//   direction-is-data: falling SpO2 is concerning, falling temperature is not
//   overdue fires after the expected interval, and only after it
//   agreementCount counts distinct concerning observations, not samples
//   the function is pure: same input, same output, no now-mutation

import { test } from "node:test";
import assert from "node:assert/strict";

import { patientTrend } from "./patientTrend.ts";
import { TREND_RULES, trendRuleFor } from "./rules/trend.rules.ts";
import type { ClinicalFact, PatientHistory, SeriesPoint } from "../contracts/index.ts";
import { VITAL } from "../world/feeds.ts";

const HOUR = 60 * 60_000;
const T = 1_700_000_000_000;

let seq = 0;
function point(ts: number, value: number): SeriesPoint {
  seq += 1;
  return Object.freeze({ ts, value, eventId: `e_${String(seq).padStart(6, "0")}` });
}

function history(over: Partial<PatientHistory> & { series: PatientHistory["series"] }): PatientHistory {
  return Object.freeze({
    patientId: "elena_petrova",
    asOf: T,
    name: "Elena Petrova",
    mrn: "MRN-002",
    summary: "",
    room: "room-2",
    simulated: false,
    conditions: Object.freeze([]),
    medications: Object.freeze([]),
    facts: Object.freeze([]),
    timeline: Object.freeze([]),
    ...over,
  } satisfies PatientHistory);
}

// ---------------------------------------------------------------- basics

test("a rising systolic BP series is worsening, with correct delta and persistence", () => {
  const series = [
    point(T, 132),
    point(T + HOUR, 142),
    point(T + 2 * HOUR, 151),
    point(T + 3 * HOUR, 159),
  ];
  const h = history({ series: { systolic_bp: series } });
  const trends = patientTrend(h, T + 3 * HOUR + 1);

  const bp = trends.signals.find((s) => s.observation === "systolic_bp")!;
  assert.equal(bp.baseline, 132);
  assert.equal(bp.current, 159);
  assert.equal(bp.delta, 27);
  assert.equal(bp.direction, "worsening");
  assert.equal(bp.concerning, true);
  assert.equal(bp.sampleCount, 4);
  // Monotonically rising for the whole series: persistence spans it all.
  assert.equal(bp.persistenceMs, 3 * HOUR);
  assert.ok(bp.ratePerHour !== null && bp.ratePerHour > 0);
  // Evidence cites the baseline sample(s) and the current sample, not every
  // reading in between — those points don't ground baseline or current.
  assert.deepEqual([...bp.evidenceEventIds], [series[0].eventId, series[3].eventId]);
});

test("one sample concludes nothing", () => {
  const h = history({ series: { systolic_bp: [point(T, 200)] } });
  const trends = patientTrend(h, T + 1);

  const bp = trends.signals.find((s) => s.observation === "systolic_bp")!;
  assert.equal(bp.sampleCount, 1);
  assert.equal(bp.direction, "unknown");
  assert.equal(bp.ratePerHour, null);
  assert.equal(bp.persistenceMs, 0);
  assert.equal(bp.concerning, false);
});

test("zero samples yields nulls, never zeros", () => {
  const h = history({ series: {} });
  const trends = patientTrend(h, T);

  const bp = trends.signals.find((s) => s.observation === "systolic_bp")!;
  assert.equal(bp.sampleCount, 0);
  assert.equal(bp.baseline, null);
  assert.equal(bp.current, null);
  assert.equal(bp.delta, null);
  assert.equal(bp.direction, "unknown");
  assert.equal(bp.sinceLastSampleMs, null);
  assert.equal(bp.overdue, false);
  assert.deepEqual([...bp.evidenceEventIds], []);
});

test("a flat series is stable", () => {
  const series = [point(T, 120), point(T + HOUR, 120), point(T + 2 * HOUR, 121)];
  const h = history({ series: { systolic_bp: series } });
  const trends = patientTrend(h, T + 2 * HOUR + 1);

  const bp = trends.signals.find((s) => s.observation === "systolic_bp")!;
  assert.equal(bp.direction, "stable");
  assert.equal(bp.concerning, false);
});

// ------------------------------------------------ direction is data, not logic

test("direction-is-data: falling SpO2 is concerning, falling temperature is not", () => {
  const spo2 = [point(T, 98), point(T + HOUR, 96), point(T + 2 * HOUR, 94), point(T + 3 * HOUR, 92)];
  const temperature = [point(T, 38.5), point(T + HOUR, 38.0), point(T + 2 * HOUR, 37.4), point(T + 3 * HOUR, 36.8)];
  const h = history({ series: { spo2, temperature } });
  const trends = patientTrend(h, T + 3 * HOUR + 1);

  const spo2Signal = trends.signals.find((s) => s.observation === "spo2")!;
  const tempSignal = trends.signals.find((s) => s.observation === "temperature")!;

  assert.equal(spo2Signal.direction, "worsening");
  assert.equal(spo2Signal.concerning, true);

  // A falling temperature moved in the GOOD direction for temperature.
  assert.equal(tempSignal.direction, "improving");
  assert.equal(tempSignal.concerning, false);

  // Confirms the rule table, not a guess, drives the asymmetry.
  assert.equal(trendRuleFor("spo2")!.badDirection, "falling");
  assert.equal(trendRuleFor("temperature")!.badDirection, "rising");
});

// ------------------------------------------------------------------ overdue

test("overdue fires after the expected interval, and not before", () => {
  const rule = trendRuleFor("spo2")!;
  const series = [point(T, 97)];
  const h = history({ series: { spo2: series } });

  const justBefore = patientTrend(h, T + rule.expectedIntervalMs - 1);
  const justAfter = patientTrend(h, T + rule.expectedIntervalMs + 1);

  const before = justBefore.signals.find((s) => s.observation === "spo2")!;
  const after = justAfter.signals.find((s) => s.observation === "spo2")!;

  assert.equal(before.overdue, false);
  assert.equal(after.overdue, true);
  assert.equal(after.sinceLastSampleMs, rule.expectedIntervalMs + 1);
});

// ------------------------------------------------------------- agreement

test("agreementCount counts distinct concerning observations, and persistence is the longest among them", () => {
  const bp = [point(T, 132), point(T + HOUR, 142), point(T + 2 * HOUR, 151), point(T + 3 * HOUR, 159)];
  const hr = [point(T, 80), point(T + HOUR, 87), point(T + 2 * HOUR, 95), point(T + 3 * HOUR, 104)];
  const spo2 = [point(T, 98), point(T + HOUR, 96), point(T + 2 * HOUR, 94), point(T + 3 * HOUR, 92)];
  const h = history({ series: { systolic_bp: bp, heart_rate: hr, spo2 } });
  const trends = patientTrend(h, T + 3 * HOUR + 1);

  assert.equal(trends.agreementCount, 3);
  assert.equal(trends.persistenceMs, 3 * HOUR);
});

test("supportingFactIds pulls only facts whose direction is worsening", () => {
  const facts: readonly ClinicalFact[] = Object.freeze([
    Object.freeze({
      id: "fact-1",
      patientId: "elena_petrova",
      observedAt: T,
      group: "vital-signs",
      name: "blood pressure rising",
      direction: "worsening",
      evidenceEventIds: Object.freeze(["e_000001"]),
      source: "derived",
    } satisfies ClinicalFact),
    Object.freeze({
      id: "fact-2",
      patientId: "elena_petrova",
      observedAt: T,
      group: "vital-signs",
      name: "temperature settling",
      direction: "improving",
      evidenceEventIds: Object.freeze(["e_000002"]),
      source: "derived",
    } satisfies ClinicalFact),
  ]);
  const h = history({ series: {}, facts });
  const trends = patientTrend(h, T);

  assert.deepEqual([...trends.supportingFactIds], ["fact-1"]);
});

// ------------------------------------------------------------------- purity

test("purity: same input, same output, and now is never mutated", () => {
  const series = [point(T, 132), point(T + HOUR, 142)];
  const h = history({ series: { systolic_bp: series } });

  const a = patientTrend(h, T + HOUR + 5000);
  const b = patientTrend(h, T + HOUR + 5000);

  assert.deepEqual(a, b);
  assert.equal(h.series.systolic_bp.length, 2);
});

test("output is frozen", () => {
  const h = history({ series: { systolic_bp: [point(T, 132), point(T + HOUR, 142)] } });
  const trends = patientTrend(h, T + HOUR + 1);

  assert.throws(() => {
    // @ts-expect-error deliberate mutation attempt
    trends.agreementCount = 99;
  });
  assert.ok(Object.isFrozen(trends));
  assert.ok(Object.isFrozen(trends.signals[0]));
});

// ---------------------------------------------------------- rule table sanity

test("every rule row is exercised: unknown observations produce no signal", () => {
  const h = history({ series: { made_up_observation: [point(T, 1), point(T + HOUR, 2)] } });
  const trends = patientTrend(h, T + HOUR + 1);

  assert.equal(trends.signals.length, TREND_RULES.length);
  assert.ok(!trends.signals.some((s) => s.observation === "made_up_observation"));
});

// ---------------------------------------------------------------- drift guard

// The rules table keys on observation NAMES, and the feed publishes them as
// string literals. Nothing in the type system connects the two, so a rename on
// either side silently stops the trend evaluating rather than failing loudly —
// which is exactly what happened once: the table said "resp_rate" while the
// monitor published "respiratory_rate", so respiratory trends were never
// computed and no test noticed. This asserts they still agree.
//
// Same pattern as pipeline/observations.test.ts, which pins its vocabulary
// against engines/rules/patient.rules for the same reason.
test("every trend rule names an observation the monitor actually publishes", () => {
  const published = new Set<string>(Object.values(VITAL));
  // The monitor has no diastolic channel yet; charts supply it (world/chart).
  published.add("diastolic_bp");

  for (const rule of TREND_RULES) {
    assert.ok(
      published.has(rule.observation),
      `trend rule "${rule.observation}" matches nothing the feed emits: ` +
        `[${[...published].sort().join(", ")}]`,
    );
  }
});
