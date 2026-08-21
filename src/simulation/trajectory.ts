// Simulation: a deterministic forward-simulator for a patient's vitals.
//
// FAKED, DELIBERATELY AND VISIBLY (honesty law). A real chart stops at
// whatever the last encounter was; the ward cannot wait days for a story to
// play out on stage. This module continues a patient's series past that
// last charted date so a multi-day deterioration (or recovery) can run in
// minutes. Every event this produces is a `vital` source event exactly like
// world/feeds.ts's simulated monitor and world/chart.ts's parsed history —
// there is no separate "fake" event shape, because the honesty law is
// discharged at the surface (docs, UI, PatientRecord.simulated), never by
// making the data itself untrustworthy to the engines that read it.
//
// NO RANDOMNESS ANYWHERE. Same header requirement as world/feeds.ts: this
// file rolls no dice and reads no clock. A trajectory is a data table of
// deltas, applied cumulatively and deterministically to a baseline the
// caller supplies. Generating a trajectory twice, from the same baseline and
// start time, produces byte-identical events — a jury that asks "run that
// again" gets the same answer, and a replay to T reproduces T exactly.
//
// SHAPES ARE DATA, NOT CODE (CLAUDE.md: "engines/rules/ is data, not
// logic"). Adding an eighth shape, or retuning how fast an existing one
// moves, should touch only SHAPE_DELTAS below.

import type { EventInput, Millis, PatientId } from "../contracts/index.ts";

export type TrajectoryShape =
  | "stable"
  | "improving"
  | "gradual-hypertension"
  | "gradual-respiratory-deterioration"
  | "medication-related"
  | "sudden-emergency";

export const TRAJECTORY_SHAPES: readonly TrajectoryShape[] = Object.freeze([
  "stable",
  "improving",
  "gradual-hypertension",
  "gradual-respiratory-deterioration",
  "medication-related",
  "sudden-emergency",
]);

/** The patient's last known reading per observation — where the trajectory
 * picks up from. Whichever observations are absent are simply never
 * projected: a shape cannot invent a starting value it was not given. */
export type Baseline = Readonly<Record<string, number>>;

const HOUR = 60 * 60 * 1000;

/** Four hours between forward-simulated points: a plausible observation
 * cadence, and enough for the acceptance test's three advances to each read
 * as a distinct nursing round rather than an arbitrary tick. */
export const DEFAULT_STEP_MS = 4 * HOUR;

type Delta = Readonly<Record<string, number>>;

/**
 * Per-shape, per-step deltas, applied cumulatively to the baseline.
 *
 * Each array is one "advance" in the demo. `stable`'s zero-deltas are
 * deliberate, not an oversight: a shape with no keys would project no
 * events at all, and silence is its own signal (SPEC.md) — a stable patient
 * must still show three flat, corroborating readings, not the absence of
 * any.
 */
const SHAPE_DELTAS: Readonly<Record<TrajectoryShape, readonly Delta[]>> = Object.freeze({
  stable: Object.freeze([
    Object.freeze({ systolic_bp: 0, diastolic_bp: 0, heart_rate: 0, spo2: 0 }),
    Object.freeze({ systolic_bp: 0, diastolic_bp: 0, heart_rate: 0, spo2: 0 }),
    Object.freeze({ systolic_bp: 0, diastolic_bp: 0, heart_rate: 0, spo2: 0 }),
  ]),
  improving: Object.freeze([
    Object.freeze({ systolic_bp: -4, diastolic_bp: -2, heart_rate: -3, spo2: 1 }),
    Object.freeze({ systolic_bp: -3, diastolic_bp: -2, heart_rate: -2, spo2: 1 }),
    Object.freeze({ systolic_bp: -3, diastolic_bp: -1, heart_rate: -2, spo2: 0 }),
  ]),
  // The general shape a rising, agreeing BP-and-HR / falling-SpO2 story
  // follows. elena_petrova's demo run does NOT use these deltas — see
  // ELENA_PETROVA_ACCEPTANCE_LADDER below for why.
  "gradual-hypertension": Object.freeze([
    Object.freeze({ systolic_bp: 10, diastolic_bp: 6, heart_rate: 7, spo2: -2 }),
    Object.freeze({ systolic_bp: 9, diastolic_bp: 5, heart_rate: 8, spo2: -2 }),
    Object.freeze({ systolic_bp: 8, diastolic_bp: 4, heart_rate: 9, spo2: -2 }),
  ]),
  "gradual-respiratory-deterioration": Object.freeze([
    Object.freeze({ respiratory_rate: 3, spo2: -2, heart_rate: 4 }),
    Object.freeze({ respiratory_rate: 3, spo2: -2, heart_rate: 5 }),
    Object.freeze({ respiratory_rate: 4, spo2: -3, heart_rate: 6 }),
  ]),
  // A plausible over-medication story: heart rate and pressure drift down
  // together (e.g. beta-blockade or diuresis outpacing the patient), rather
  // than up — the point is that "trending" is not always "worsening", and
  // the trend engine has to read direction, not just magnitude.
  "medication-related": Object.freeze([
    Object.freeze({ heart_rate: -6, systolic_bp: -8, diastolic_bp: -5 }),
    Object.freeze({ heart_rate: -5, systolic_bp: -6, diastolic_bp: -4 }),
    Object.freeze({ heart_rate: -4, systolic_bp: -4, diastolic_bp: -3 }),
  ]),
  // One step, not a ladder: SPEC.md is explicit that defined emergency
  // conditions skip the persistence ladder entirely, so this shape does too.
  "sudden-emergency": Object.freeze([
    Object.freeze({ spo2: -10, heart_rate: 30, systolic_bp: -25, respiratory_rate: 10 }),
  ]),
});

/** Round to one decimal place. Guards against float drift from repeated
 * addition across steps (e.g. 0.1 + 0.1 + 0.1) so replay stays exact down
 * to the digit, not just "close enough". */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function cumulativeDeltas(deltas: readonly Delta[]): Delta[] {
  const totals: Delta[] = [];
  let running: Record<string, number> = {};
  for (const step of deltas) {
    running = { ...running };
    for (const [observation, change] of Object.entries(step)) {
      running[observation] = (running[observation] ?? 0) + change;
    }
    totals.push(Object.freeze({ ...running }));
  }
  return totals;
}

function vitalEvent(
  patientId: PatientId,
  room: string,
  ts: Millis,
  observation: string,
  value: number,
): EventInput {
  return {
    ts,
    patientId,
    room,
    source: "vital",
    speaker: "unknown",
    quote: "",
    code: null,
    observation,
    value,
  };
}

/**
 * elena_petrova's acceptance-test ladder, verbatim from SPEC.md's acceptance
 * test: BP 132/82 -> 142/88 -> 151/93 -> 159/97, HR 80 -> 87 -> 95 -> 104,
 * SpO2 98 -> 96 -> 94 -> 92.
 *
 * Written as absolute values, not baseline + delta, on purpose: the demo's
 * WATCH -> PERSISTING_CONCERN -> HIGH climb is scripted against these exact
 * digits, and deriving them from whatever her chart's last reading happens
 * to be would make the acceptance test hostage to chart parsing drift. This
 * is the one trajectory in the system that is a literal, not a formula.
 */
const ELENA_PETROVA_ACCEPTANCE_LADDER: readonly Baseline[] = Object.freeze([
  Object.freeze({ systolic_bp: 132, diastolic_bp: 82, heart_rate: 80, spo2: 98 }),
  Object.freeze({ systolic_bp: 142, diastolic_bp: 88, heart_rate: 87, spo2: 96 }),
  Object.freeze({ systolic_bp: 151, diastolic_bp: 93, heart_rate: 95, spo2: 94 }),
  Object.freeze({ systolic_bp: 159, diastolic_bp: 97, heart_rate: 104, spo2: 92 }),
]);

export function elenaPetrovaAcceptanceLadder(
  room: string,
  startTs: Millis,
  stepMs: Millis = DEFAULT_STEP_MS,
): EventInput[] {
  const events: EventInput[] = [];
  ELENA_PETROVA_ACCEPTANCE_LADDER.forEach((point, i) => {
    const ts = startTs + (i + 1) * stepMs;
    for (const [observation, value] of Object.entries(point)) {
      events.push(vitalEvent("elena_petrova", room, ts, observation, value));
    }
  });
  return events;
}

/**
 * Project a patient's series forward from `baseline` along `shape`,
 * starting `stepMs` after `startTs` and continuing one point every
 * `stepMs` after that.
 *
 * `startTs` is supplied by the caller (never Date.now() — this module reads
 * no clock, same rule as world/feeds.ts#monitorEvents) and is usually the
 * simulated "now" at the moment the demo operator advances the clock.
 *
 * elena_petrova requesting "gradual-hypertension" is special-cased to the
 * literal acceptance ladder above, in place of the generic delta table —
 * see that constant's comment for why.
 */
export function buildTrajectory(
  shape: TrajectoryShape,
  patientId: PatientId,
  baseline: Baseline,
  room: string,
  startTs: Millis,
  stepMs: Millis = DEFAULT_STEP_MS,
): EventInput[] {
  if (patientId === "elena_petrova" && shape === "gradual-hypertension") {
    return elenaPetrovaAcceptanceLadder(room, startTs, stepMs);
  }

  const events: EventInput[] = [];
  const cumulative = cumulativeDeltas(SHAPE_DELTAS[shape]);

  cumulative.forEach((totals, i) => {
    const ts = startTs + (i + 1) * stepMs;
    for (const [observation, delta] of Object.entries(totals)) {
      const start = baseline[observation];
      // A shape can only project an observation the baseline already has a
      // value for — inventing a starting point would be exactly the guess
      // the parsing law (world/chart.ts) forbids.
      if (start === undefined) continue;
      events.push(vitalEvent(patientId, room, ts, observation, round1(start + delta)));
    }
  });

  return events;
}
