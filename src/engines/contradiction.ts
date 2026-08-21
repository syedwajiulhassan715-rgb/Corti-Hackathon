// S2 Speech/number disagreement.
//
// Pure function of its arguments. No clock, no network, no stored state (D8):
// `now` arrives as a parameter like every other engine.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS FOR
// ---------------------------------------------------------------------------
//
// A patient who says "I feel fine" while her saturation falls and her
// respiratory rate climbs is describing silent hypoxia. It is the presentation
// that kills people who looked well on the ward round, and it is the exact
// case where a system that only reads numbers looks like it never listened,
// and a system that only reads speech misses the deterioration entirely.
//
// So this reads both and reports that they DISAGREE. The disagreement is the
// finding. It is handed to a human as a question, not resolved into a score.
//
// ---------------------------------------------------------------------------
// WHAT IT MUST NEVER DO
// ---------------------------------------------------------------------------
//
// Reassurance never lowers a level, and this function returns nothing a caller
// could add or subtract with. There is no score field and no level field, on
// purpose: a patient must not be able to talk their own priority down, least
// of all in the case this exists to catch.
//
// Only a patient can reassure. A clinician saying "you're fine" is a
// judgement, and a judgement is not evidence about somebody else's body.

import type { Event, EventId, Millis, TrendSignal } from "../contracts/index.ts";
import {
  REASSURANCE_PHRASES,
  REASSURANCE_NEGATIONS,
  CONTRADICTING_VITALS,
  CONTRADICTION_MIN_SIGNALS,
  VITAL_SPOKEN_NAMES,
} from "./rules/reassurance.rules.ts";

export interface Reassurance {
  readonly eventId: EventId;
  readonly quote: string;
  readonly speaker: Event["speaker"];
  readonly ts: Millis;
}

export interface Contradiction {
  /** Always true when returned. Null is the "no disagreement" answer. */
  readonly present: true;
  readonly reassurance: Reassurance;
  /** Which vitals are worsening, in rule order. */
  readonly worsening: readonly string[];
  /** One line, written to be read aloud on a ward round. */
  readonly note: string;
  /** The utterance, so the claim can be checked against what was said. */
  readonly evidenceEventIds: readonly EventId[];
}

/**
 * Report a patient reporting themselves well while their numbers worsen.
 *
 * Returns null when there is nothing to report, which is the common case.
 */
export function detectContradiction(
  events: readonly Event[],
  signals: readonly TrendSignal[],
  now: Millis,
): Contradiction | null {
  const reassurance = latestReassurance(events, now);
  if (reassurance === null) return null;

  const worsening = CONTRADICTING_VITALS.filter((observation) =>
    signals.some(
      (signal) => signal.observation === observation && signal.direction === "worsening",
    ),
  );

  // Two agreeing, not one. One drifting number against someone who says they
  // feel well is noise, and calling that a contradiction would cry wolf on the
  // first reading of every encounter.
  if (worsening.length < CONTRADICTION_MIN_SIGNALS) return null;

  const named = spokenList(
    worsening.map((observation) => VITAL_SPOKEN_NAMES[observation] ?? observation.replace(/_/g, " ")),
  );

  return Object.freeze({
    present: true as const,
    reassurance,
    worsening: Object.freeze([...worsening]),
    note:
      `The patient reports feeling well — "${reassurance.quote}" — while ` +
      `${named} are worsening. The two disagree. Numbers of this kind do not ` +
      `soften because somebody feels well, and someone should lay eyes on her.`,
    evidenceEventIds: Object.freeze([reassurance.eventId]),
  });
}

/** "a", "a and b", "a, b and c" -- this line gets read aloud. */
function spokenList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The most recent thing the PATIENT said that reports them as well, at or
 * before `now`. Null when nobody said one.
 */
function latestReassurance(events: readonly Event[], now: Millis): Reassurance | null {
  let latest: Reassurance | null = null;

  for (const event of events) {
    if (event.source !== "speech") continue;
    if (event.ts > now) continue;
    // Only a patient can reassure, and an unattributed voice is not a patient.
    if (event.speaker !== "patient") continue;
    if (!isReassurance(event.quote)) continue;
    if (latest !== null && event.ts <= latest.ts) continue;

    latest = Object.freeze({
      eventId: event.id,
      quote: event.quote,
      speaker: event.speaker,
      ts: event.ts,
    });
  }

  return latest;
}

/**
 * Whether a quote reports wellness.
 *
 * A negation anywhere in the utterance cancels it: "I don't feel fine"
 * contains "feel fine", and reading that as reassurance would invert the one
 * signal that exists to catch a mismatch. Crude on purpose — the safe failure
 * here is to report no contradiction, never to invent one.
 */
function isReassurance(quote: string): boolean {
  const text = ` ${quote.toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ")} `;
  if (!REASSURANCE_PHRASES.some((phrase) => text.includes(` ${phrase} `) || text.includes(`${phrase} `))) {
    return false;
  }
  return !REASSURANCE_NEGATIONS.some((negation) => text.includes(negation));
}
