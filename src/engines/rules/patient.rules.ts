// Patient State rules, encoded from docs/CLINICAL.md §2.
//
// Data, not behaviour. The engine folds the log; this file only says what to
// look for and what the clinician said about it. Criteria strings are quoted
// from CLINICAL so a reader can check the encoding against the source without
// leaving the file.
//
// The doctor owns CLINICAL.md. When it changes, this file changes to match and
// the engine does not.
//
// No clock (D8): every duration here is a window or a deadline length, never a
// point in time and never a timer.
//
// ---------------------------------------------------------------------------
// THREE HARD CONSTRAINTS, encoded rather than trusted to reviewers
// ---------------------------------------------------------------------------
//
// 1. TOKS/NEWS VALUES COME ONLY FROM STRUCTURED FEED EVENTS.
//    CLINICAL §2: "Spoken information must never be used to invent a TOKS/NEWS
//    score." This is not a style preference. V1 RESOLVED recorded a clinician
//    dictating a score and Corti transcribing it as "your neurotoxic seven".
//    A score parsed out of speech would be wrong text turned into a clinical
//    number. The engine reads scores from feed sources only; a speech event
//    claiming to carry one is ignored for scoring.
//
// 2. SPEECH CONTRIBUTES SYMPTOMS, CONCERNS AND SEVERE STATEMENTS ONLY.
//    What a human says is what raises a level. What a machine measures says
//    how far. Those two jobs never swap.
//
// 3. ONLY GROUNDED FACTS MAY RAISE A LEVEL, BELOW THE EMERGENCY LINE.
//    Non-speech corroborates and does not conclude (D2) — except at the one
//    threshold where no conclusion is being drawn. See FEED_ONLY and D10.

import type { Speaker } from "../../contracts/index.ts";

export type Level = "green" | "yellow" | "red-urgent" | "red-emergency";
export type Direction = "improving" | "stable" | "worsening" | "unknown";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * What a structured reading may do on its own, with nobody speaking (D10).
 *
 * Two rules, because "can a machine reading move a room?" is two different
 * questions with two different answers.
 *
 * ABOVE THE EMERGENCY LINE: yes. TOKS/NEWS >= 7, or any single parameter
 * scoring 3, raises to red-emergency with no utterance required. An emergency
 * threshold is a threshold, not a judgement — nobody is interpreting anything,
 * a number crossed a line that the ward already alarms on. Staying silent
 * because no one happened to speak would not be principled restraint, it would
 * be a worse version of the monitor that is already beeping.
 *
 * BELOW IT: no. Yellow and red-urgent are judgements — "is this patient
 * deteriorating in a way that matters?" — and that is exactly the call this
 * product claims to make from what people say. A feed reading may corroborate
 * such a judgement and may sharpen which band it lands in, but it may not make
 * the judgement itself. The claim is about everything below the emergency
 * line; above it, the claim was never ours to make.
 *
 * The split is also what keeps the demo honest. If feeds could raise to
 * yellow, every yellow on stage would be ambiguous — did the speech do that,
 * or would the vitals have done it anyway? Below the line, a yellow always
 * means somebody said something.
 */
export const FEED_ONLY = Object.freeze({
  /** TOKS/NEWS >= 7 or a single parameter scoring 3, with no speech. */
  mayRaiseToEmergency: true,
  /** Yellow and red-urgent always need a grounded utterance. */
  mayRaiseBelowEmergency: false,
  emergencyCriteria: Object.freeze({
    toksAtLeast: 7,
    anyParameterScoring3: true,
  }),
});

// ---------------------------------------------------------------- vocabulary

/** Observation names the engine recognises on structured feed events. */
export const OBSERVATION = Object.freeze({
  /** The aggregate TOKS/NEWS score. Feed sources only. */
  toks: "toks",
  /** A documented clinical reassessment. Releases RED to YELLOW. */
  reassessment: "clinical_reassessment",
  /** A single parameter scoring 3, reported by the feed. */
  parameterScore3: "parameter_score_3",
  oxygenRequirement: "oxygen_requirement",
  newConfusion: "new_confusion",
});

/** Observation names the engine recognises on speech events. */
export const SPEECH = Object.freeze({
  /** A new or worsening symptom. CLINICAL §2 YELLOW criterion. */
  symptom: "symptom",
  /** Documented HCP concern. CLINICAL §2 YELLOW criterion. */
  concern: "hcp_concern",
  /** "I cannot breathe" and similar. Immediate verification, no waiting. */
  severeStatement: "severe_statement",
  /** Explicit emergency request from an HCP. RED-EMERGENCY criterion. */
  emergencyRequest: "emergency_request",
});

// -------------------------------------------------------------- TOKS bands

export interface Band {
  readonly level: Level;
  readonly min: number;
  /** Inclusive. Undefined means open-ended. */
  readonly max?: number;
}

/** CLINICAL §2: 0–2 GREEN, 3–4 YELLOW, 5–6 RED-URGENT, >=7 RED-EMERGENCY. */
export const TOKS_BANDS: readonly Band[] = Object.freeze([
  Object.freeze({ level: "green" as Level, min: 0, max: 2 }),
  Object.freeze({ level: "yellow" as Level, min: 3, max: 4 }),
  Object.freeze({ level: "red-urgent" as Level, min: 5, max: 6 }),
  Object.freeze({ level: "red-emergency" as Level, min: 7 }),
]);

export function toksBand(score: number): Level {
  for (const band of TOKS_BANDS) {
    if (score >= band.min && (band.max === undefined || score <= band.max)) return band.level;
  }
  return "green";
}

/** Severity order, for taking the more serious of two candidate levels. */
export const LEVEL_ORDER: readonly Level[] = Object.freeze([
  "green",
  "yellow",
  "red-urgent",
  "red-emergency",
]);

export function moreSerious(a: Level, b: Level): Level {
  return LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;
}

// -------------------------------------------------- criteria and responses

export interface Response {
  /** Deadline to inform the responsible person. 0 means immediate. */
  readonly notifyWithinMs: number;
  /** Deadline for clinical reassessment / repeat observations. */
  readonly reassessWithinMs: number;
  /** Deadline for a competent clinical review, where CLINICAL sets one. */
  readonly reviewWithinMs?: number;
  /** Maximum interval between observations until review. 0 means continuous. */
  readonly observationIntervalMs?: number;
  readonly text: string;
}

export interface LevelDefinition {
  readonly level: Level;
  /** Quoted from CLINICAL §2, for auditability. */
  readonly criteria: readonly string[];
  readonly response: Response;
}

/** GREEN response depends on the score: 0 gets 12 hours, 1–2 gets 4–6 hours. */
export const GREEN_RESPONSE = Object.freeze({
  score0: Object.freeze({
    notifyWithinMs: 0,
    reassessWithinMs: 12 * HOUR,
    text: "TOKS/NEWS 0: reassessment within 12 hours.",
  } satisfies Response),
  score1to2: Object.freeze({
    notifyWithinMs: 0,
    reassessWithinMs: 4 * HOUR,
    reviewWithinMs: 6 * HOUR,
    text: "TOKS/NEWS 1-2: reassessment within 4-6 hours.",
  } satisfies Response),
});

export const LEVELS: Readonly<Record<Level, LevelDefinition>> = Object.freeze({
  green: Object.freeze({
    level: "green" as Level,
    criteria: Object.freeze([
      "TOKS/NEWS 0-2.",
      "No individual parameter scores 3.",
      "No new clinical concern.",
      "Stable or improving observations.",
      "Oxygen requirement is stable or decreasing.",
    ]),
    response: GREEN_RESPONSE.score0,
  }),
  yellow: Object.freeze({
    level: "yellow" as Level,
    criteria: Object.freeze([
      "TOKS/NEWS 3-4.",
      "Increase of at least 2 points.",
      "New or worsening symptom.",
      "Documented HCP concern.",
      "Recent improvement after a RED state.",
      "Current observations are incomplete or overdue.",
    ]),
    response: Object.freeze({
      notifyWithinMs: 15 * MINUTE,
      reassessWithinMs: 60 * MINUTE,
      text: "Responsible nurse informed within 15 minutes. Clinical reassessment and repeat observations within 60 minutes.",
    } satisfies Response),
  }),
  "red-urgent": Object.freeze({
    level: "red-urgent" as Level,
    criteria: Object.freeze([
      "TOKS/NEWS 5-6.",
      "One individual parameter scores 3.",
      "New confusion.",
      "Increasing oxygen requirement.",
      "Significant documented deterioration.",
    ]),
    response: Object.freeze({
      notifyWithinMs: 0,
      reassessWithinMs: 60 * MINUTE,
      reviewWithinMs: 60 * MINUTE,
      observationIntervalMs: 60 * MINUTE,
      text: "Immediate notification. Competent clinical review within 60 minutes. Observations at least hourly until review and a documented plan.",
    } satisfies Response),
  }),
  "red-emergency": Object.freeze({
    level: "red-emergency" as Level,
    criteria: Object.freeze([
      "TOKS/NEWS >=7.",
      "Acute airway, breathing or circulation problem.",
      "Unresponsiveness.",
      "Explicit emergency request from an HCP.",
    ]),
    response: Object.freeze({
      notifyWithinMs: 0,
      reassessWithinMs: 0,
      observationIntervalMs: 0,
      text: "Immediate emergency response. Continuous monitoring according to local protocol.",
    } satisfies Response),
  }),
});

// -------------------------------------------------------------- direction

/** CLINICAL §2: "A change of at least 2 points within four hours is significant." */
export const SIGNIFICANT_CHANGE = Object.freeze({
  points: 2,
  windowMs: 4 * HOUR,
});

export const DIRECTION_RULES = Object.freeze({
  improving: "Latest score is lower.",
  stable: "Latest score is unchanged.",
  worsening: "Latest score is higher.",
  unknown: "Only one valid score is available.",
});

// ------------------------------------------------------ spoken information

export const SPOKEN = Object.freeze({
  /** "One new relevant symptom from one speaker creates a YELLOW reassessment trigger." */
  oneSpeakerSymptomSufficientForYellow: true,
  /**
   * "Repetition by the same speaker strengthens the evidence but is not an
   * independent source." Recorded in the explanation, never counted twice.
   */
  repetitionCorroborates: false,
  /** "Confirmation by two different speakers counts as corroboration." */
  twoSpeakersCorroborate: true,
  /**
   * "Spoken concern combined with abnormal structured observations within 10
   * minutes determines the state according to TOKS/NEWS."
   */
  structuredCorroborationWindowMs: 10 * MINUTE,
  /** "Spoken information must never be used to invent a TOKS/NEWS score." */
  neverInventToksFromSpeech: true,
});

/**
 * "Severe statements such as 'I cannot breathe' trigger immediate
 * verification. The system must not wait for a second speaker before
 * responding to a possible emergency."
 *
 * requiredSpeaker is null deliberately. An unattributed severe statement is
 * still a severe statement; refusing to act because diarization could not name
 * the voice would be the wrong failure. Every other rule here requires
 * attribution.
 */
export const SEVERE_STATEMENT = Object.freeze({
  level: "red-emergency" as Level,
  requiresSecondSpeaker: false,
  requiredSpeaker: null as Speaker | null,
  action: "Immediate verification.",
  /** Illustrative only. Classification is upstream; this is for the explanation. */
  examples: Object.freeze(["I cannot breathe", "I can't breathe", "I am choking"]),
});

// --------------------------------------------------------- de-escalation

export const DEESCALATION = Object.freeze({
  /** "RED must not change directly to GREEN after one improved measurement." */
  redMayGoDirectlyToGreen: false,
  /** "RED changes to YELLOW after documented improvement and clinical reassessment." */
  redToYellow: Object.freeze({
    requiresDocumentedImprovement: true,
    requiresReassessment: true,
  }),
  /**
   * "YELLOW changes to GREEN after two stable or improving observation sets at
   * least 60 minutes apart."
   */
  yellowToGreen: Object.freeze({
    observationSets: 2,
    minGapMs: 60 * MINUTE,
  }),
  /** "Recent RED events remain visible in the 24-hour report." */
  redVisibleForMs: 24 * HOUR,
});

export function isRed(level: Level): boolean {
  return level === "red-urgent" || level === "red-emergency";
}
