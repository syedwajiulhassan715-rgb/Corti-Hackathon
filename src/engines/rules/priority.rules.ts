// Priority rules — the delayed-trigger ladder, encoded as data.
//
// Data, not behaviour (CLAUDE.md, "engines/rules/ is data, not logic").
// engines/prioritization.ts folds PatientTrends + PatientHistory into a
// PatientPriority; this file says how far is far enough, for how long, with
// how much agreement. Threshold changes touch no code, only this table —
// that is the entire point of keeping it separate from the fold.
//
// ---------------------------------------------------------------------------
// THE ONE RULE EVERYTHING ELSE SERVES (CLAUDE.md product law, SPEC.md v2):
//
//   Escalation above WATCH requires EITHER a speech event in the evidence OR
//   multi-signal numeric agreement that has PERSISTED over time. A single
//   reading never concludes.
//
// WATCH itself needs neither: noticing one concerning signal, however briefly
// held, costs nothing and is exactly what "the system waits for sufficient
// evidence, not zero evidence" means in practice. Everything above WATCH is
// gated by GATES below, and the gate is an OR: a grounded utterance is enough
// on its own, and so is agreement-plus-persistence on its own. Neither
// substitutes for the other's job — speech says something is wrong, numbers
// say how consistently — but either is sufficient to climb.
// ---------------------------------------------------------------------------

import type { PriorityLevel } from "../../contracts/index.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The ladder, weakest to most urgent. Index is used as the severity order. */
export const LADDER: readonly PriorityLevel[] = Object.freeze([
  "GREEN",
  "WATCH",
  "PERSISTING_CONCERN",
  "HIGH",
  "CRITICAL",
]);

export function severity(level: PriorityLevel): number {
  return LADDER.indexOf(level);
}

export function moreUrgent(a: PriorityLevel, b: PriorityLevel): PriorityLevel {
  return severity(a) >= severity(b) ? a : b;
}

// ------------------------------------------------------------------ WATCH
//
// WATCH needs one concerning signal and nothing else — no persistence floor,
// no agreement floor, no speech. This is the "noticed" rung: the trend engine
// already refuses to call something concerning off one sample (TrendSignal's
// own contract says "one sample is never a trend"), so by the time a signal
// reaches this engine marked concerning it already rests on more than a
// single point. WATCH just surfaces that; it does not yet conclude anything.

export const WATCH_RULE = Object.freeze({
  minConcerningSignals: 1,
});

// ------------------------------------------------------------- the gates
//
// One row per rung above WATCH. `minPersistenceMs` and `minAgreementCount`
// are the NUMERIC path (both must hold, together, on the same climb).
// `speechSufficient: true` means a speech event anywhere in the evidence
// satisfies this rung on its own, no matter what the numbers say — that is
// the OR in the product law. A rung with `speechSufficient: false` cannot be
// reached by speech alone, but none of ours are: CLAUDE.md draws the OR at
// "above WATCH" as a whole, not per-rung, so every rung above WATCH honours
// it identically.

export interface Gate {
  readonly level: PriorityLevel;
  readonly minPersistenceMs: number;
  readonly minAgreementCount: number;
  readonly minSampleCount: number;
  readonly speechSufficient: boolean;
}

/**
 * WHY speechSufficient IS true ONLY ON THE FIRST RUNG ABOVE WATCH:
 *
 * The product law's OR ("a speech event OR multi-signal agreement persisting")
 * says what LEGITIMISES leaving WATCH at all — it does not say a single
 * grounded utterance keeps re-firing forever as you climb. Mirroring the
 * house split in patient.rules.ts ("SPEECH RAISES... STRUCTURED READINGS SAY
 * HOW FAR"): a quote is what makes PERSISTING_CONCERN a legitimate judgement
 * instead of a guess. Reaching HIGH or the ladder's CRITICAL after that still
 * needs escalating numeric evidence over time — the utterance does not get
 * counted twice. A patient who keeps deteriorating after being believed once
 * climbs on the numbers; a patient who stops deteriorating does not climb
 * further just because someone spoke an hour ago.
 */
export const GATES: readonly Gate[] = Object.freeze([
  Object.freeze({
    level: "PERSISTING_CONCERN" as PriorityLevel,
    minPersistenceMs: 2 * HOUR,
    minAgreementCount: 2,
    minSampleCount: 3,
    speechSufficient: true,
  }),
  Object.freeze({
    level: "HIGH" as PriorityLevel,
    minPersistenceMs: 4 * HOUR,
    minAgreementCount: 3,
    minSampleCount: 4,
    speechSufficient: false,
  }),
  Object.freeze({
    level: "CRITICAL" as PriorityLevel,
    // Reachable via the ladder (not just the emergency jump below) when
    // agreement and persistence are both severe and sustained. Most CRITICAL
    // in the demo comes from EMERGENCY_CONDITIONS, not this row — this row
    // exists so a slow, wide, long deterioration with no single alarming
    // reading can still get there without inventing an emergency threshold
    // for it.
    minPersistenceMs: 8 * HOUR,
    minAgreementCount: 4,
    minSampleCount: 5,
    speechSufficient: false,
  }),
]);

// ------------------------------------------------------- near-miss / withheld
//
// A rule that almost fired and did not is exactly as informative as one that
// fired. These ratios say how close counts as close, so "withheld" is not a
// judgement call made ad hoc in the fold — it is read off this table like
// everything else.

export const NEAR_MISS = Object.freeze({
  /** Persistence at or above this fraction of the gate's floor is "close". */
  persistenceRatio: 0.5,
  /** Agreement short by exactly this many signals is "close". */
  agreementGap: 1,
  /** A value within this fraction of an emergency threshold is "close". */
  emergencyRatio: 0.1,
});

// --------------------------------------------------------- emergency jump
//
// Defined emergency conditions skip the ladder entirely (SPEC.md, "Only
// defined emergency conditions skip the ladder"). One structured reading is
// enough — deliberately, the same way patient.rules.ts lets a TOKS/NEWS >= 7
// raise on its own: an emergency threshold is a threshold, not a judgement,
// so nobody is waiting for a second signal or a spoken word once it is
// crossed. `observation` matches TrendSignal.observation / SeriesPoint keys.

export interface EmergencyCondition {
  readonly observation: string;
  readonly comparator: "gte" | "lte";
  readonly threshold: number;
  readonly explanation: string;
}

export const EMERGENCY_CONDITIONS: readonly EmergencyCondition[] = Object.freeze([
  Object.freeze({
    observation: "spo2",
    comparator: "lte" as const,
    threshold: 88,
    explanation: "SpO2 at or below 88 is a defined emergency threshold — the reading alone is enough.",
  }),
  Object.freeze({
    observation: "systolic_bp",
    comparator: "gte" as const,
    threshold: 200,
    explanation: "Systolic BP at or above 200 is a defined emergency threshold — the reading alone is enough.",
  }),
  Object.freeze({
    observation: "heart_rate",
    comparator: "gte" as const,
    threshold: 150,
    explanation: "Heart rate at or above 150 is a defined emergency threshold — the reading alone is enough.",
  }),
  Object.freeze({
    observation: "heart_rate",
    comparator: "lte" as const,
    threshold: 35,
    explanation: "Heart rate at or below 35 is a defined emergency threshold — the reading alone is enough.",
  }),
  Object.freeze({
    observation: "respiratory_rate",
    comparator: "gte" as const,
    threshold: 35,
    explanation: "Respiratory rate at or above 35 is a defined emergency threshold — the reading alone is enough.",
  }),
]);

export function emergencyFired(condition: EmergencyCondition, value: number): boolean {
  return condition.comparator === "gte" ? value >= condition.threshold : value <= condition.threshold;
}

/** How close `value` is to firing, as a fraction of the threshold's margin. 0 = at the line, 1 = untouched. */
export function emergencyDistanceRatio(condition: EmergencyCondition, value: number): number {
  const denom = Math.abs(condition.threshold) || 1;
  const gap = condition.comparator === "gte" ? condition.threshold - value : value - condition.threshold;
  return Math.max(0, gap) / denom;
}

// ------------------------------------------------------------ the receipt
//
// Points per component. Weights live here, not in the fold, so a demo-day
// rebalance ("silence should count for more") is a number changed in this
// file, never a branch changed in prioritization.ts.

export const WEIGHTS = Object.freeze({
  /** Per concerning signal, scaled by how far it has moved past its own floor. */
  trendPerConcerningSignal: 4,
  /** Per signal beyond the first that agrees, i.e. rewards corroboration. */
  agreementPerExtraSignal: 6,
  /** Per full hour of persistence on the longest-held concerning signal, capped. */
  persistencePerHour: 2,
  persistenceCapPoints: 24,
  /** Flat, per overdue (silent) signal. */
  silencePerOverdueSignal: 5,
  /** Flat, per unresolved plan item with no matching action. */
  unresolvedTaskEach: 3,
  /** Flat, per first-class overdue care gap. */
  careGapEach: 6,
  /** Per hour since the chart itself was last touched, capped. */
  timeWaitingPerHour: 1,
  timeWaitingCapPoints: 10,
  /** Flat bonus for a grounded (speech) event in the evidence. */
  speechGrounded: 10,
  /** Flat, added once when an emergency condition fires. */
  emergencyJump: 50,
});
