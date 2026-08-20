// Patient State rules.
//
// ============================ PROVISIONAL ============================
// Seeded by the pipeline lane to unblock engines/patientState.ts. NOT
// clinically signed off. The doctor owns what belongs here: which concepts
// count, which window, which level, and what the explanation says.
// Replace wholesale rather than editing around — nothing downstream should
// grow a dependency on the specific shape of this one rule.
// =====================================================================
//
// Data, not behaviour. The engine folds the log; a rule only says what to
// look for. No clock (D8) — the window is a duration, never a deadline.

import type { Speaker } from "../../contracts/index.ts";

export type Level = "green" | "yellow" | "red";

export const FOUR_HOURS = 4 * 60 * 60 * 1000;

export interface PatientRule {
  readonly id: string;
  /** True until the clinician has signed it off. Surfaced in the explanation. */
  readonly provisional: boolean;
  readonly level: Level;
  /** Coded concepts that count as a mention. Feeds never carry a code. */
  readonly codes: readonly string[];
  /** The first mention must be attributed to this role. */
  readonly reportedBy: Speaker;
  /** The second mention may come from anyone; it must fall inside this window. */
  readonly windowMs: number;
}

/**
 * PROVISIONAL. Breathing difficulty reported by the patient, then mentioned
 * again by anyone within four hours, is yellow.
 *
 * The shape of the rule is the point: one report is a moment, two mentions
 * inside a window is a trend. A single utterance never moves a room.
 */
export const BREATHING_DIFFICULTY: PatientRule = Object.freeze({
  id: "breathing-difficulty-repeated",
  provisional: true,
  level: "yellow",
  codes: Object.freeze(["R06.0", "R06.00", "R06.02", "R06.09"]),
  reportedBy: "patient",
  windowMs: FOUR_HOURS,
});

/** Every rule the engine folds, in order. One today. */
export const PATIENT_RULES: readonly PatientRule[] = Object.freeze([BREATHING_DIFFICULTY]);
