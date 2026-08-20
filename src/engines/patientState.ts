// S5 Patient State. CLINICAL.md §2, folded over the event log.
//
// Pure function of the event log. No network, no stored state.
// Takes `now` as an explicit argument (D8). Never calls Date.now().
// Live passes Date.now(); replay passes the timestamp of the last event read.
//
// The division of labour, and the reason this engine is shaped the way it is:
//
//   SPEECH RAISES. A symptom, a concern or a severe statement is what moves a
//   room off green. Only speech can do it (D2), and only attributed speech,
//   except for severe statements where CLINICAL says not to wait.
//
//   STRUCTURED READINGS SAY HOW FAR. Once speech has raised, the TOKS/NEWS
//   band decides whether that is yellow, red-urgent or red-emergency. Scores
//   are read from feed sources only — never parsed out of an utterance. See
//   the constraints block in rules/patient.rules.ts.
//
//   DE-ESCALATION IS A RATCHET. Coming down is slower than going up, and the
//   rules for it live in DEESCALATION. Nothing here can turn a red room green
//   in one step.
//
// Rules are data in rules/patient.rules.ts. This file is the fold.

import type { Event, EventId, Millis } from "../contracts/index.ts";
import {
  DEESCALATION,
  FEED_MAY_RAISE_ALONE,
  GREEN_RESPONSE,
  LEVELS,
  OBSERVATION,
  SEVERE_STATEMENT,
  SIGNIFICANT_CHANGE,
  SPEECH,
  SPOKEN,
  isRed,
  moreSerious,
  toksBand,
  type Direction,
  type Level,
  type Response,
} from "./rules/patient.rules.ts";

export interface PatientState {
  readonly room: string;
  readonly level: Level;
  readonly reason_text: string;
  readonly evidence: readonly EventId[];
  readonly changed_at: Millis;
  /** Consumed by web/, which animates the change. Never omitted. */
  readonly previous_level: Level;
  readonly toks_direction: Direction;
  /** A change of at least 2 points inside four hours. */
  readonly significant_change: boolean;
  /** Two different speakers have said it. Strengthens; does not escalate. */
  readonly corroborated: boolean;
  /** The response CLINICAL attaches to this level. */
  readonly response: Response;
}

export interface PatientStateOptions {
  readonly room: string;
  /** The level before this fold. Defaults to green. */
  readonly previousLevel?: Level;
}

interface Scores {
  readonly latest?: Event;
  readonly previous?: Event;
  readonly direction: Direction;
  readonly significant: boolean;
  readonly all: readonly Event[];
}

const isSpeech = (e: Event) => e.source === "speech";
const isFeed = (e: Event) => e.source !== "speech";
const attributed = (e: Event) => e.speaker !== "unknown";

/**
 * TOKS/NEWS scores, from feed sources only.
 *
 * A speech event carrying observation 'toks' is deliberately excluded rather
 * than trusted: CLINICAL forbids inventing a score from speech, and V1
 * RESOLVED showed a dictated score arriving as "your neurotoxic seven".
 */
function readScores(events: readonly Event[]): Scores {
  const all = events
    .filter((e) => isFeed(e) && e.observation === OBSERVATION.toks && typeof e.value === "number")
    .sort((a, b) => a.ts - b.ts);

  const latest = all.at(-1);
  const previous = all.at(-2);

  let direction: Direction = "unknown";
  if (latest !== undefined && previous !== undefined) {
    const delta = (latest.value as number) - (previous.value as number);
    direction = delta < 0 ? "improving" : delta > 0 ? "worsening" : "stable";
  }

  let significant = false;
  if (latest !== undefined) {
    for (const earlier of all) {
      if (earlier === latest) continue;
      const withinWindow = latest.ts - earlier.ts <= SIGNIFICANT_CHANGE.windowMs;
      const moved = Math.abs((latest.value as number) - (earlier.value as number));
      if (withinWindow && moved >= SIGNIFICANT_CHANGE.points) {
        significant = true;
        break;
      }
    }
  }

  return { latest, previous, direction, significant, all };
}

/** The level the structured score alone would indicate, if any score exists. */
function bandLevel(scores: Scores): Level | undefined {
  return scores.latest === undefined ? undefined : toksBand(scores.latest.value as number);
}

function greenResponse(scores: Scores): Response {
  const score = scores.latest?.value;
  if (typeof score === "number" && score >= 1) return GREEN_RESPONSE.score1to2;
  return GREEN_RESPONSE.score0;
}

/**
 * Observation sets that would release YELLOW: two stable-or-improving scores
 * at least 60 minutes apart, the later one no worse than the earlier.
 */
function releasesYellow(scores: Scores): readonly Event[] | undefined {
  const { observationSets, minGapMs } = DEESCALATION.yellowToGreen;
  const sets = scores.all;
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const gap = sets[j].ts - sets[i].ts;
      const notWorse = (sets[j].value as number) <= (sets[i].value as number);
      if (gap >= minGapMs && notWorse && observationSets === 2) return [sets[i], sets[j]];
    }
  }
  return undefined;
}

/** Documented improvement plus a documented reassessment releases RED to YELLOW. */
function releasesRed(
  scores: Scores,
  events: readonly Event[],
): { improvement: Event; reassessment: Event } | undefined {
  if (!DEESCALATION.redToYellow.requiresDocumentedImprovement) return undefined;
  if (scores.direction !== "improving" || scores.latest === undefined) return undefined;

  const reassessment = events.find(
    (e) => e.observation === OBSERVATION.reassessment && e.ts >= scores.latest!.ts,
  );
  if (reassessment === undefined) return undefined;
  return { improvement: scores.latest, reassessment };
}

export function patientState(
  events: readonly Event[],
  now: Millis,
  options: PatientStateOptions,
): PatientState {
  const previous_level = options.previousLevel ?? "green";
  const visible = events.filter((e) => e.room === options.room && e.ts <= now);

  const scores = readScores(visible);
  const speech = visible.filter(isSpeech);

  // --- what speech has raised -------------------------------------------
  const severe = speech.filter(
    (e) =>
      e.observation === SPEECH.severeStatement ||
      e.observation === SPEECH.emergencyRequest,
  );
  const raising = speech.filter(
    (e) =>
      attributed(e) &&
      (e.observation === SPEECH.symptom || e.observation === SPEECH.concern),
  );

  const speakers = new Set(raising.map((e) => e.speaker));
  const corroborated = SPOKEN.twoSpeakersCorroborate && speakers.size >= 2;

  const reason: string[] = [];
  let level: Level = "green";
  let trigger: Event | undefined;
  const evidence: Event[] = [];

  if (severe.length > 0) {
    // CLINICAL: immediate verification, no waiting for a second speaker.
    trigger = severe[0];
    level = SEVERE_STATEMENT.level;
    evidence.push(trigger);
    reason.push(
      `Severe statement at ts ${trigger.ts}${attributed(trigger) ? ` from the ${trigger.speaker}` : " (speaker unattributed)"}: ` +
        `"${trigger.quote}". ${SEVERE_STATEMENT.action} Not waiting for a second speaker.`,
    );
  } else if (raising.length > 0) {
    trigger = raising[0];
    level = "yellow";
    evidence.push(...raising);
    reason.push(
      `New symptom or concern reported by the ${trigger.speaker} at ts ${trigger.ts}: "${trigger.quote}". ` +
        `One speaker is sufficient for YELLOW.`,
    );

    const band = bandLevel(scores);
    if (band !== undefined && scores.latest !== undefined) {
      level = moreSerious(level, band);
      evidence.push(scores.latest);
      reason.push(
        `TOKS/NEWS ${scores.latest.value} (structured, ts ${scores.latest.ts}) puts this in the ${band.toUpperCase()} band.`,
      );
    } else {
      reason.push("No structured TOKS/NEWS score available, so the band cannot narrow this further.");
    }

    if (corroborated) {
      reason.push(`Corroborated: ${speakers.size} different speakers.`);
    } else if (raising.length > 1) {
      reason.push(
        `${raising.length} mentions from one speaker — repetition strengthens the evidence but is not an independent source.`,
      );
    }

    if (scores.significant) {
      reason.push(
        `Score moved at least ${SIGNIFICANT_CHANGE.points} points inside ${SIGNIFICANT_CHANGE.windowMs / 3_600_000} hours, which is significant.`,
      );
    }
  } else if (FEED_MAY_RAISE_ALONE && bandLevel(scores) !== undefined) {
    // Off by default. See the constraints block in patient.rules.ts.
    level = bandLevel(scores)!;
    trigger = scores.latest;
    if (trigger !== undefined) evidence.push(trigger);
    reason.push(`TOKS/NEWS ${scores.latest?.value} with no speech (FEED_MAY_RAISE_ALONE is on).`);
  } else {
    reason.push(greenReason(visible, speech, scores));
  }

  // --- de-escalation ratchet --------------------------------------------
  const held = applyDeescalation(level, previous_level, scores, visible, reason, evidence);

  const responseFor: Response =
    held === "green" ? greenResponse(scores) : LEVELS[held].response;

  return Object.freeze({
    room: options.room,
    level: held,
    reason_text: reason.join(" "),
    evidence: Object.freeze(evidence.map((e) => e.id)),
    changed_at: held === previous_level ? 0 : (trigger?.ts ?? scores.latest?.ts ?? 0),
    previous_level,
    toks_direction: scores.direction,
    significant_change: scores.significant,
    corroborated,
    response: responseFor,
  });
}

/**
 * Coming down is slower than going up. Escalation is never damped; only a fall
 * towards green is held back, and only for the reasons CLINICAL gives.
 */
function applyDeescalation(
  proposed: Level,
  previous: Level,
  scores: Scores,
  visible: readonly Event[],
  reason: string[],
  evidence: Event[],
): Level {
  const goingUp = moreSerious(proposed, previous) === proposed && proposed !== previous;
  if (goingUp || proposed === previous) return proposed;

  if (isRed(previous)) {
    const release = releasesRed(scores, visible);
    if (release === undefined) {
      reason.push(
        `Held at ${previous.toUpperCase()}: de-escalation from RED needs documented improvement and a clinical reassessment.`,
      );
      return previous;
    }
    evidence.push(release.improvement, release.reassessment);
    reason.push(
      `De-escalated to YELLOW: improving score at ts ${release.improvement.ts} and reassessment at ts ${release.reassessment.ts}. ` +
        `RED never goes straight to GREEN.`,
    );
    return "yellow";
  }

  if (previous === "yellow" && proposed === "green") {
    const release = releasesYellow(scores);
    if (release === undefined) {
      reason.push(
        `Held at YELLOW: de-escalation needs ${DEESCALATION.yellowToGreen.observationSets} stable or improving ` +
          `observation sets at least ${DEESCALATION.yellowToGreen.minGapMs / 60_000} minutes apart.`,
      );
      return "yellow";
    }
    evidence.push(...release);
    reason.push(
      `De-escalated to GREEN: stable or improving scores at ts ${release[0].ts} and ts ${release[1].ts}.`,
    );
    return "green";
  }

  return proposed;
}

/** Say why nothing fired. A green with no explanation is a green nobody trusts. */
function greenReason(
  visible: readonly Event[],
  speech: readonly Event[],
  scores: Scores,
): string {
  if (visible.length === 0) return "No events in this room.";

  if (speech.length === 0) {
    const score = scores.latest === undefined ? "" : ` Latest structured TOKS/NEWS is ${scores.latest.value}.`;
    return (
      `${visible.length} structured reading${visible.length === 1 ? "" : "s"} and no speech. ` +
      `Readings corroborate, they never conclude.${score}`
    );
  }

  const unattributed = speech.filter(
    (e) => !attributed(e) && (e.observation === SPEECH.symptom || e.observation === SPEECH.concern),
  );
  if (unattributed.length > 0) {
    return (
      `${unattributed.length} relevant utterance${unattributed.length === 1 ? "" : "s"} with no speaker attributed. ` +
      `Diarization did not separate the voices, so no rule requiring a speaker can fire.`
    );
  }

  return `${speech.length} utterance${speech.length === 1 ? "" : "s"}, none carrying a symptom, concern or severe statement.`;
}
