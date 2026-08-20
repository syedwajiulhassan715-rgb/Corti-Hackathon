// S2 Candidates. Coded utterances in, claims out.
//
// Pure function of its arguments. No clock, no network, no stored state (D8).
//
// This is the missing link between coding and the rules. corti/coding puts an
// ICD-10 code on an utterance; engines/rules/patient.rules.ts keys on a small
// clinical vocabulary — symptom, hcp_concern, severe_statement,
// emergency_request — and nothing turned one into the other. This file does,
// and it is deliberately the least clever file in the pipeline.
//
// IT PROPOSES. IT DOES NOT DECIDE.
// Every claim leaving here is a Candidate, which means it is still worthless
// until pipeline/grounding accepts it. The proposer never reads event.speaker
// when it sets expectedSpeaker: it states who the claim *requires*, from the
// kind of observation alone, and lets the gate find out whether the right
// person actually said it. That is the whole reason a clinician saying "you
// have pneumonia coughing hurts" does not become a patient-reported cough.
//
// IT NEVER READS A NUMBER.
// patient.rules.ts constraint 1: spoken information must never be used to
// invent a TOKS/NEWS score, and constraint 2: speech contributes symptoms,
// concerns and severe statements only. So nothing here parses a value, and
// every Candidate goes out with value null. This recording is exactly why —
// it contains "your new TOX value is seven" (ASR-mangled) and a clinician
// reading "oxygen saturation is 80 f 7% ... pulse 180". Both are speech. Both
// are ignored as measurements. Measurements come from feeds or not at all.
//
// WHAT IS AND IS NOT VALIDATED
// The code table below is validated in the sense that Corti assigned the
// codes; mapping a code to a clinical meaning is the doctor's call and the
// table is written as data so she can read it without reading code. The
// phrase table is weaker and I want that on the record: V2 warned that a
// hand-rolled table is a classifier nobody validated. It is kept short, it
// only ever proposes, and the gate downstream is what makes it safe to be
// wrong. Do not grow it without the doctor.

import type { Candidate } from "./grounding.ts";
import type { Event, Speaker } from "../contracts/index.ts";

/**
 * Observation names, matching engines/rules/patient.rules.ts SPEECH exactly.
 *
 * Duplicated as literals rather than imported, to keep pipeline/ from
 * depending on engines/rules/. observations.test.ts asserts they still agree,
 * so the duplication cannot drift silently.
 */
const SYMPTOM = "symptom";
const HCP_CONCERN = "hcp_concern";
const SEVERE_STATEMENT = "severe_statement";
const EMERGENCY_REQUEST = "emergency_request";

export interface CodeObservation {
  readonly code: string;
  /** The endpoint's display text, so the table reads without a code book. */
  readonly display: string;
  readonly observation: string;
  /** Who the claim requires. Not who happened to speak. */
  readonly expectedSpeaker: Speaker;
}

/**
 * ICD-10 codes that mean a patient reported a symptom.
 *
 * Doctor-owned data. One line per code, no logic.
 *
 * Deliberately absent, and each absence is a decision:
 *
 *   J18.9  Pneumonia — the diagnosis the patient was admitted with, not
 *          something new. On this recording it is the clinician saying "you
 *          have pneumonia" as a reason to dismiss. Admitting it as a new
 *          symptom would let a known diagnosis raise a level every time
 *          someone mentions it out loud.
 *   R09.02 Hypoxemia, R06.82 Tachypnea, R00.0 Tachycardia, I95.9 Hypotension
 *          — on this recording all four came from one clinician reading a
 *          monitor aloud. They are measurements, and measurements do not enter
 *          through speech (constraint 2). A feed may report them; a voice may
 *          not.
 */
export const CODE_OBSERVATIONS: readonly CodeObservation[] = Object.freeze([
  Object.freeze({ code: "R06.02", display: "Shortness of breath", observation: SYMPTOM, expectedSpeaker: "patient" as Speaker }),
  Object.freeze({ code: "R06.00", display: "Dyspnea, unspecified", observation: SYMPTOM, expectedSpeaker: "patient" as Speaker }),
  Object.freeze({ code: "R07.89", display: "Other chest pain", observation: SYMPTOM, expectedSpeaker: "patient" as Speaker }),
  Object.freeze({ code: "R07.9", display: "Chest pain, unspecified", observation: SYMPTOM, expectedSpeaker: "patient" as Speaker }),
  Object.freeze({ code: "R52", display: "Pain, unspecified", observation: SYMPTOM, expectedSpeaker: "patient" as Speaker }),
  Object.freeze({ code: "R42", display: "Dizziness and giddiness", observation: SYMPTOM, expectedSpeaker: "patient" as Speaker }),
  Object.freeze({ code: "R05.9", display: "Cough, unspecified", observation: SYMPTOM, expectedSpeaker: "patient" as Speaker }),
]);

export interface PhraseObservation {
  readonly observation: string;
  readonly expectedSpeaker: Speaker;
  /** Lowercase substrings. Matched literally — no regex, no stemming. */
  readonly phrases: readonly string[];
}

/**
 * Things that carry clinical weight because of what was said, not because a
 * code was returned.
 *
 * These exist because coding cannot see them. "I cannot breathe" codes as
 * R06.02, the same as "I'm a bit puffed" — the code says which symptom, never
 * how alarming the wording was. patient.rules.ts SEVERE_STATEMENT exists for
 * exactly that gap and says so: "Illustrative only. Classification is
 * upstream." Upstream is here.
 *
 * Matching is literal substring on lowercased text, because V1b established
 * that transcript punctuation cannot be relied on and some speakers produce
 * none at all. Nothing here may assume a sentence boundary.
 */
export const PHRASE_OBSERVATIONS: readonly PhraseObservation[] = Object.freeze([
  Object.freeze({
    observation: SEVERE_STATEMENT,
    expectedSpeaker: "patient" as Speaker,
    phrases: Object.freeze([
      "cannot breathe",
      "can't breathe",
      "cannot catch my breath",
      "can't catch my breath",
      "i am choking",
      "i'm choking",
    ]),
  }),
  Object.freeze({
    observation: EMERGENCY_REQUEST,
    expectedSpeaker: "clinician" as Speaker,
    phrases: Object.freeze([
      "urgent clinical assistance",
      "calling the acute team",
      "call the acute team",
      "emergency team",
      "crash team",
      "resus",
    ]),
  }),
  Object.freeze({
    observation: HCP_CONCERN,
    expectedSpeaker: "clinician" as Speaker,
    phrases: Object.freeze([
      "changed significantly",
      "i am worried",
      "i'm worried",
      "i am concerned",
      "i'm concerned",
      "this is not right",
    ]),
  }),
]);

/** Deterministic and readable: the event it came from, plus what is claimed. */
function candidateId(event: Event, observation: string): string {
  return `c_${event.id}_${observation}`;
}

/**
 * Propose one claim per (utterance, observation) pair.
 *
 * Order is event order, then code table order, then phrase table order, so the
 * output is stable for the same input — replay depends on it.
 *
 * A single utterance may produce several candidates. e_000015 on the room-02
 * recording carries both a concern and an emergency request; splitting them is
 * correct, because they are two different claims that a rule may need
 * separately.
 *
 * Non-speech events produce nothing. Feeds corroborate, they never conclude
 * (D2), and a candidate resting on a feed would be discarded by the gate
 * anyway — proposing it would only add noise to the refusal list.
 */
export function propose(events: readonly Event[]): readonly Candidate[] {
  const candidates: Candidate[] = [];

  for (const event of events) {
    if (event.source !== "speech") continue;
    if (event.quote.trim() === "") continue;

    const text = event.quote.toLowerCase();
    const seen = new Set<string>();

    // Coded claims first: the code is the stronger signal, being the one
    // thing here that a validated model produced rather than a table.
    if (event.code !== null) {
      for (const entry of CODE_OBSERVATIONS) {
        if (entry.code !== event.code) continue;
        if (seen.has(entry.observation)) continue;
        seen.add(entry.observation);
        candidates.push(
          Object.freeze({
            id: candidateId(event, entry.observation),
            room: event.room,
            observation: entry.observation,
            value: null,
            expectedSpeaker: entry.expectedSpeaker,
            sourceEventId: event.id,
          }),
        );
      }
    }

    for (const entry of PHRASE_OBSERVATIONS) {
      if (seen.has(entry.observation)) continue;
      const hit = entry.phrases.find((phrase) => text.includes(phrase));
      if (hit === undefined) continue;
      seen.add(entry.observation);
      candidates.push(
        Object.freeze({
          id: candidateId(event, entry.observation),
          room: event.room,
          observation: entry.observation,
          value: null,
          expectedSpeaker: entry.expectedSpeaker,
          sourceEventId: event.id,
          // The matched words, so the gate checks them back against the
          // utterance rather than taking this file's word for it.
          quote: hit,
        }),
      );
    }
  }

  return Object.freeze(candidates);
}
