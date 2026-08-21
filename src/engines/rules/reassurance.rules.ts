// Reassurance rules. What "I am fine" sounds like.
//
// Data, not behaviour. The engine folds the log; this file only says which
// phrases count as a patient saying they feel well, and the engine does the
// rest. Doctor-owned, like patient.rules.ts.
//
// No clock (D8). No logic here at all.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS, AND WHAT IT MUST NEVER DO
// ---------------------------------------------------------------------------
//
// Reassurance NEVER lowers a level. Not once, not by a point.
//
// "I feel fine" while saturation falls and respiratory rate climbs is silent
// hypoxia, and it is the presentation that kills people who looked well on
// the ward round. A system that let a patient talk its own score down would
// be dangerous in exactly the case it most needs to be right.
//
// So reassurance is read for one purpose only: to notice that the person and
// the numbers DISAGREE, and to say so out loud. The disagreement is the
// finding. The escalation still belongs to the numbers.
//
// Only a PATIENT can reassure. A clinician saying "you're fine" is a
// judgement, and judgements are not evidence about a body.

/**
 * Phrases that mean a patient is reporting themselves as well.
 *
 * Matched case-insensitively against a whole utterance, on word boundaries.
 * Deliberately short and literal: a long list would quietly become a sentiment
 * model, and a sentiment model has no place deciding anything clinical.
 *
 * Deliberately ABSENT, and each absence is a decision:
 *
 *   "better"  — "better than yesterday" is a trajectory, not a state, and it
 *               is just as often said by someone still deteriorating.
 *   "okay"    — carries the whole range from "unharmed" to "I don't want to
 *               make a fuss", which is the phrase this file most needs not to
 *               mistake for wellness.
 *   "good"    — "good morning" is not a clinical claim.
 */
export const REASSURANCE_PHRASES: readonly string[] = Object.freeze([
  "i feel fine",
  "i'm fine",
  "im fine",
  "i am fine",
  "feeling fine",
  "i feel well",
  "i'm well",
  "i am well",
  "feeling well",
  "i feel alright",
  "i'm alright",
  "i am alright",
  "nothing hurts",
  "no pain at all",
  "i feel normal",
  "i feel like myself",
  "back to normal",
]);

/**
 * Negations that cancel a reassurance match inside the same utterance.
 *
 * "I don't feel fine" contains "feel fine". Without this the engine would read
 * the exact opposite of what was said, on the one signal that exists to catch
 * a mismatch.
 */
export const REASSURANCE_NEGATIONS: readonly string[] = Object.freeze([
  "don't", "dont", "do not", "not ", "never", "wasn't", "wasnt", "isn't", "isnt",
  "no longer", "stopped feeling", "used to",
]);

/**
 * Vital observations whose worsening is allowed to contradict reassurance.
 *
 * Feed-sourced only. A number a human spoke is not a measurement
 * (patient.rules.ts constraint 1), and must never end up on this side of a
 * disagreement it would then be used to win.
 */
export const CONTRADICTING_VITALS: readonly string[] = Object.freeze([
  "spo2",
  "respiratory_rate",
  "heart_rate",
  "systolic_bp",
  "temperature",
]);

/**
 * How many vitals must be worsening before a disagreement is reported.
 *
 * Two, not one. A single drifting number against a patient who says they feel
 * well is noise, and calling that a contradiction on stage would cry wolf on
 * the first reading of every encounter. Two agreeing is the same bar the
 * ladder uses everywhere else: numbers may corroborate each other.
 */
export const CONTRADICTION_MIN_SIGNALS = 2;

/**
 * How each vital is said out loud. "spo2" is a column heading, not something a
 * nurse says to another nurse at a bedside, and this line is written to be
 * read aloud.
 */
export const VITAL_SPOKEN_NAMES: Readonly<Record<string, string>> = Object.freeze({
  spo2: "oxygen saturation",
  respiratory_rate: "respiratory rate",
  heart_rate: "heart rate",
  systolic_bp: "blood pressure",
  temperature: "temperature",
});
