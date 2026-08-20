// What this conversation added to what was already known.
//
// Pure function of its arguments. No clock, no network, no disk (D8) — the
// chart arrives as an argument, loaded by world/patients.
//
// This is the projection the product is actually about. Patient State says how
// bad the room is; this says what changed about the person. A symptom that is
// new is worth more than a symptom the chart has carried for a year, and the
// only way to tell them apart is to hold the conversation against the record.
//
// THREE OUTPUTS, AND THE THIRD IS THE POINT
//
//   known    a coded finding the chart already carries. Corroboration, not
//            news. On this recording: pneumonia, which the clinician cites as
//            the reason not to look further.
//   fresh    a coded finding with no counterpart on the problem list. This is
//            what the conversation contributed that nobody had written down.
//   flags    a prior condition that makes something said today worth asking
//            about. Always phrased as a question (engines/rules/history.rules).
//
// Everything cites event ids. A line here that cannot name the utterance
// behind it is a line that does not get emitted.

import { HISTORY_FLAGS, type HistoryFlag } from "../engines/rules/history.rules.ts";
import type { PatientRecord } from "../world/patients.ts";
import type { Event, EventId, Millis } from "../contracts/index.ts";

export interface Finding {
  /** ICD-10 as coding returned it. */
  readonly code: string;
  /** The utterance that carried it, verbatim. */
  readonly quote: string;
  readonly speaker: string;
  readonly eventId: EventId;
  readonly ts: Millis;
  /** Set when the chart already carries this code. */
  readonly matchesCondition?: string;
}

export interface RaisedFlag {
  readonly id: string;
  readonly question: string;
  readonly why: string;
  /** The problem-list entry that made it apply. */
  readonly condition: string;
  readonly conditionLabel: string;
  /** What in this conversation set it off. */
  readonly evidence: readonly EventId[];
  readonly matched: readonly string[];
}

export interface HistoryView {
  readonly room: string;
  readonly patient: string;
  readonly mrn: string;
  readonly summary: string;
  /** Always true while the room assignment is hardcoded. */
  readonly simulated: boolean;
  readonly conditions: readonly { code: string; label: string; status: string }[];
  readonly known: readonly Finding[];
  readonly fresh: readonly Finding[];
  readonly flags: readonly RaisedFlag[];
  /** Facts extracted from speech and appended to the log, in order. */
  readonly extracted: readonly {
    observation: string;
    quote: string;
    speaker: string;
    eventId: EventId;
    ts: Millis;
  }[];
}

const UTTERANCE = "utterance";

function raise(
  flag: HistoryFlag,
  label: string,
  evidence: readonly EventId[],
  matched: readonly string[],
): RaisedFlag {
  return Object.freeze({
    id: flag.id,
    question: flag.question,
    why: flag.why,
    condition: flag.requiresCondition,
    conditionLabel: label,
    evidence: Object.freeze([...evidence]),
    matched: Object.freeze([...matched]),
  });
}

/**
 * Fold the log against the chart, as at `now`.
 *
 * `now` is an argument and never a clock reading, so scrubbing the demo back
 * in time produces the history view as it stood then — the same fold, asked
 * about a different moment.
 */
export function history(
  events: readonly Event[],
  record: PatientRecord | undefined,
  room: string,
  now: Millis,
): HistoryView | undefined {
  if (record === undefined) return undefined;

  const visible = events.filter((e) => e.room === room && e.ts <= now);
  const utterances = visible.filter((e) => e.observation === UTTERANCE);
  const derived = visible.filter((e) => e.observation !== UTTERANCE && e.source === "speech");

  const onChart = new Map(record.conditions.map((c) => [c.code, c]));

  const known: Finding[] = [];
  const fresh: Finding[] = [];
  const seenCodes = new Set<string>();

  for (const event of utterances) {
    if (event.code === null) continue;
    if (seenCodes.has(event.code)) continue;
    seenCodes.add(event.code);

    const condition = onChart.get(event.code);
    const finding: Finding = Object.freeze({
      code: event.code,
      quote: event.quote,
      speaker: event.speaker,
      eventId: event.id,
      ts: event.ts,
      ...(condition === undefined ? {} : { matchesCondition: condition.label }),
    });
    (condition === undefined ? fresh : known).push(finding);
  }

  // Flags need the whole conversation, not just the first mention of a code:
  // the question is earned by everything that was said, and the evidence line
  // should show all of it.
  const flags: RaisedFlag[] = [];
  for (const flag of HISTORY_FLAGS) {
    const condition = onChart.get(flag.requiresCondition);
    if (condition === undefined) continue;

    const evidence: EventId[] = [];
    const matched: string[] = [];

    for (const event of utterances) {
      if (event.code !== null && flag.triggeredByCodes.includes(event.code)) {
        evidence.push(event.id);
        if (!matched.includes(event.code)) matched.push(event.code);
        continue;
      }
      const text = event.quote.toLowerCase();
      const phrase = flag.triggeredByPhrases.find((p) => text.includes(p));
      if (phrase !== undefined) {
        evidence.push(event.id);
        if (!matched.includes(phrase)) matched.push(phrase);
      }
    }

    if (evidence.length === 0) continue;
    flags.push(raise(flag, condition.label, evidence, matched));
  }

  return Object.freeze({
    room,
    patient: record.name,
    mrn: record.mrn,
    summary: record.summary,
    simulated: record.simulated,
    conditions: Object.freeze(record.conditions.map((c) => Object.freeze({ ...c }))),
    known: Object.freeze(known),
    fresh: Object.freeze(fresh),
    flags: Object.freeze(flags),
    extracted: Object.freeze(
      derived.map((e) =>
        Object.freeze({
          observation: e.observation,
          quote: e.quote,
          speaker: e.speaker,
          eventId: e.id,
          ts: e.ts,
        }),
      ),
    ),
  });
}
