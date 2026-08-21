// The v2 domain contract. History, facts, trends, priority.
//
// WRITTEN BEFORE THE IMPLEMENTATIONS, ON PURPOSE. Five workstreams build
// against this file at once. It is the only thing they share, so a change here
// is a change to everybody's work — change the doc first, then this file in a
// commit of its own, then tell the other lanes.
//
// Nothing in here has behaviour. Types only, so importing it can never create
// a dependency between two engines that are supposed to be independent folds
// over the same log.

import type { EventId, Millis, PatientId, Speaker } from "./events.ts";

// ---------------------------------------------------------------- facts

/**
 * Corti's own fact taxonomy, from GET /v2/factgroups/ (verified 2026-08-21).
 *
 * Adopted wholesale rather than invented. These are the exact keys the API
 * accepts on POST /v2/interactions/{id}/facts/, so a fact ECHO derives and a
 * fact Corti returns are the same kind of thing and round-trip without a
 * mapping layer. An unknown group is a 404 from the API, which is why this is
 * a closed union and not a string.
 */
export type FactGroup =
  | "chief-complaint"
  | "history-of-present-illness"
  | "past-medical-history"
  | "family-history"
  | "social-history"
  | "functional-status"
  | "medications-prior-to-visit"
  | "allergies"
  | "demographics"
  | "vital-signs"
  | "laboratory-results"
  | "imaging-results"
  | "normal-physical-findings"
  | "abnormal-physical-findings"
  | "denials-of-symptoms"
  | "concerns-and-expectations"
  | "assessment"
  | "plan"
  | "actions"
  | "other";

export type Direction = "improving" | "stable" | "worsening" | "unknown";

/**
 * One clinical claim about one patient at one time.
 *
 * `evidenceEventIds` is never empty. A fact that cannot name the events behind
 * it does not get constructed — that is the product law in the type system.
 */
export interface ClinicalFact {
  readonly id: string;
  readonly patientId: PatientId;
  readonly observedAt: Millis;
  readonly group: FactGroup;
  /** Short name, e.g. "shortness of breath". */
  readonly name: string;
  readonly value?: string | number | boolean;
  readonly direction?: Direction;
  /** Who said it, when it came from speech. Absent for feed-derived facts. */
  readonly speaker?: Speaker;
  /** Verbatim, when speech-derived. Empty for feed-derived. */
  readonly quote?: string;
  /** ICD-10 from Corti coding, when the utterance carried one. */
  readonly code?: string | null;
  /** At least one. Enforced by the constructor, not by the type. */
  readonly evidenceEventIds: readonly EventId[];
  /** "corti" when Corti produced it; "derived" when ECHO folded it from feeds. */
  readonly source: "corti" | "derived";
}

// ---------------------------------------------------------------- trends

/**
 * A trend for ONE observation on ONE patient, as at `now`.
 *
 * `baseline` is this patient's own earlier value, never a population range.
 * That is the whole intellectual claim of the product, so it is the first
 * field and it is not optional.
 */
export interface TrendSignal {
  readonly patientId: PatientId;
  /** Matches Event.observation, e.g. "systolic_bp", "spo2". */
  readonly observation: string;
  /** This patient's own baseline over the baseline window. */
  readonly baseline: number | null;
  readonly current: number | null;
  /** current - baseline. Null when either side is missing. */
  readonly delta: number | null;
  readonly direction: Direction;
  /** Units per hour. Signed. Null when there are too few points. */
  readonly ratePerHour: number | null;
  /** How long `direction` has held, in ms. 0 when it just flipped. */
  readonly persistenceMs: Millis;
  /** How many samples the trend rests on. One sample is never a trend. */
  readonly sampleCount: number;
  /** Whether this observation moved in the clinically concerning direction. */
  readonly concerning: boolean;
  /** Ms since the last sample. The silence signal. */
  readonly sinceLastSampleMs: Millis | null;
  /**
   * True when nothing has been recorded for longer than this observation's
   * expected interval. Silence is a signal, not the absence of one.
   */
  readonly overdue: boolean;
  readonly evidenceEventIds: readonly EventId[];
}

/** Every trend for one patient, plus what they agree about. */
export interface PatientTrends {
  readonly patientId: PatientId;
  readonly asOf: Millis;
  readonly signals: readonly TrendSignal[];
  /**
   * How many distinct observations are concerning at once. The corroboration
   * count — what lets numbers conclude without a quote, per the v2 product law.
   */
  readonly agreementCount: number;
  /** Longest persistence among the concerning signals. */
  readonly persistenceMs: Millis;
  /** Facts from conversation that support the concerning direction. */
  readonly supportingFactIds: readonly string[];
}

// ---------------------------------------------------------------- priority

export type PriorityLevel =
  | "GREEN"
  | "WATCH"
  | "PERSISTING_CONCERN"
  | "HIGH"
  | "CRITICAL";

/**
 * One named contribution to a patient's priority.
 *
 * The receipt. Every number a clinician sees must decompose into these, each
 * citing events. There is no opaque total anywhere in the system.
 */
export interface PriorityComponent {
  /** e.g. "trend", "persistence", "agreement", "unresolved-tasks", "silence". */
  readonly name: string;
  /** Plain line a clinician reads, e.g. "SpO2 fell 7 points over 40 minutes". */
  readonly explanation: string;
  /** Signed contribution to the score. */
  readonly points: number;
  readonly evidenceEventIds: readonly EventId[];
}

export interface PatientPriority {
  readonly patientId: PatientId;
  readonly level: PriorityLevel;
  /** 1 is most urgent. Assigned across the ward, so it needs the whole set. */
  readonly rank: number;
  /** Sum of component points. Shown, never hidden. */
  readonly score: number;
  readonly components: readonly PriorityComponent[];
  /** One line each, for the queue card. Derived from components. */
  readonly reasons: readonly string[];
  /**
   * Why this patient was NOT escalated further. Populated when a rule was
   * close to firing and deliberately did not. The "why not" panel reads this;
   * it is what proves the system discriminates rather than alerting on
   * everything.
   */
  readonly withheld: readonly string[];
  readonly evidenceEventIds: readonly EventId[];
  readonly previousLevel: PriorityLevel | null;
  readonly lastUpdatedAt: Millis;
}

// ---------------------------------------------------------------- history

/** A dated numeric series for one observation. */
export interface SeriesPoint {
  readonly ts: Millis;
  readonly value: number;
  readonly eventId: EventId;
}

/**
 * Everything known about one patient at one moment, folded from the log.
 *
 * A projection, never a store. Never replace evidence with generated prose:
 * `narrative` is the only generated field and it is always optional and always
 * derived from the rest, never a substitute for it.
 */
export interface PatientHistory {
  readonly patientId: PatientId;
  readonly asOf: Millis;
  readonly name: string;
  readonly mrn: string;
  readonly summary: string;
  readonly room: string | null;
  /** True while the bed assignment is hardcoded. Printed in the UI. */
  readonly simulated: boolean;
  readonly conditions: readonly { code: string; label: string; status: string }[];
  readonly medications: readonly { name: string; dose: string; frequency: string }[];
  readonly facts: readonly ClinicalFact[];
  /** Observation name -> dated series. The trend engine's input. */
  readonly series: Readonly<Record<string, readonly SeriesPoint[]>>;
  /** Every event about this patient, in ts order, for the timeline. */
  readonly timeline: readonly EventId[];
}
