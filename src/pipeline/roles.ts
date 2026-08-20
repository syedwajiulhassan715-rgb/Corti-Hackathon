// S2 Role assignment. Diarization slot -> clinician or patient.
//
// Pure function of its arguments. No clock, no network, no stored state (D8).
//
// Two paths, and the refusal matters more than the heuristic:
//
//   more than one slot -> decide by question density, tie-broken by clinical
//                         vocabulary, and report which of the two decided it
//   exactly one slot   -> return the events untouched, speaker 'unknown',
//                         resolved: false
//
// A single slot means diarization gave us nothing to separate. Labelling that
// speaker 'clinician' would put an invented attribution on the evidence line,
// which is the one thing this system exists not to do. V1 and V1b ran four
// files and got one slot every time, so this is the live path today, not a
// defensive branch. See docs/VALIDATION.md.
//
// The Event contract carries no speakerId, so slots arrive as a separate map
// from event id to slot. That keeps contracts/events.ts frozen and keeps this
// function honest about what it was given.

import type { Event, EventId, Speaker } from "../contracts/index.ts";

export type RoleMethod =
  /** Two or more slots, separated by how often each one asks questions. */
  | "question-density"
  /** Question rates tied; clinical vocabulary decided it. */
  | "clinical-vocabulary"
  /** Two or more slots that both heuristics scored identically. Nothing assigned. */
  | "tie-unresolved"
  /** Diarization returned one slot. Nothing assigned. */
  | "single-slot-unresolved"
  /** No speech events at all. Nothing assigned. */
  | "no-speech-unresolved";

export interface SlotProfile {
  readonly slot: number;
  readonly utterances: number;
  readonly questions: number;
  /** questions / utterances, 0..1. */
  readonly questionRate: number;
  /** Clinical terms per utterance. Tie-break only. */
  readonly clinicalRate: number;
  readonly role: Speaker;
}

export interface RoleAssignment {
  readonly events: readonly Event[];
  readonly method: RoleMethod;
  /** False means no role was assigned and every speaker is still 'unknown'. */
  readonly resolved: boolean;
  /** Per-slot evidence, so a surface can show why — or why not. */
  readonly slots: readonly SlotProfile[];
  /** One line, written to be read aloud. */
  readonly note: string;
}

/**
 * Words that open a question. Needed because '?' cannot be relied on: V1b
 * found speakers who dictate no punctuation at all, so a transcript may be one
 * long unpunctuated run.
 */
const INTERROGATIVES = new Set([
  "how", "what", "when", "where", "which", "who", "whom", "whose", "why",
  "do", "does", "did", "is", "are", "was", "were", "am",
  "have", "has", "had", "can", "could", "shall", "should", "will", "would",
  "may", "might", "any", "anything", "tell",
]);

/**
 * Vocabulary a clinician uses and a patient generally does not. Deliberately
 * small and deliberately a tie-break only — it is a weaker signal than turn
 * shape, and a long list would quietly become a diagnosis model.
 */
const CLINICAL_TERMS = [
  "examine", "examination", "auscultate", "auscultation", "palpate", "palpation",
  "prescribe", "prescribed", "prescription", "dose", "dosage", "mg", "ml",
  "blood pressure", "heart rate", "saturation", "bloods", "swab", "biopsy",
  "diagnosis", "differential", "referral", "refer", "admit", "discharge",
  "follow up", "review", "scan", "x-ray", "ecg", "bloodwork", "titrate",
];

const WORD = /[a-z']+/g;

function isQuestion(quote: string): boolean {
  const text = quote.trim();
  if (text === "") return false;
  if (text.includes("?")) return true;

  const first = text.toLowerCase().match(WORD)?.[0];
  return first !== undefined && INTERROGATIVES.has(first);
}

function clinicalHits(quote: string): number {
  const text = quote.toLowerCase();
  let hits = 0;
  for (const term of CLINICAL_TERMS) if (text.includes(term)) hits += 1;
  return hits;
}

function withSpeaker(event: Event, speaker: Speaker): Event {
  return Object.freeze({ ...event, speaker });
}

function unresolved(
  events: readonly Event[],
  method: RoleMethod,
  slots: readonly SlotProfile[],
  note: string,
): RoleAssignment {
  return Object.freeze({
    events: Object.freeze(events.slice()),
    method,
    resolved: false,
    slots: Object.freeze(slots),
    note,
  });
}

/**
 * Assign clinician and patient to diarization slots.
 *
 * `slots` maps event id to the speakerId the transcript carried. Events absent
 * from the map — every non-speech event — pass through untouched and are not
 * counted.
 */
export function assignRoles(
  events: readonly Event[],
  slots: ReadonlyMap<EventId, number>,
): RoleAssignment {
  const counts = new Map<number, { utterances: number; questions: number; clinical: number }>();

  for (const event of events) {
    if (event.source !== "speech") continue;
    const slot = slots.get(event.id);
    if (slot === undefined) continue;

    const tally = counts.get(slot) ?? { utterances: 0, questions: 0, clinical: 0 };
    tally.utterances += 1;
    if (isQuestion(event.quote)) tally.questions += 1;
    tally.clinical += clinicalHits(event.quote);
    counts.set(slot, tally);
  }

  const profiles = [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slot, t]) => ({
      slot,
      utterances: t.utterances,
      questions: t.questions,
      questionRate: t.questions / t.utterances,
      clinicalRate: t.clinical / t.utterances,
      role: "unknown" as Speaker,
    }));

  if (profiles.length === 0) {
    return unresolved(events, "no-speech-unresolved", [], "No speech events, so no roles to assign.");
  }

  if (profiles.length === 1) {
    return unresolved(
      events,
      "single-slot-unresolved",
      profiles.map((p) => Object.freeze(p)),
      "Diarization returned one slot, so every speaker is left unknown. " +
        "A single voice cannot be told apart from a single speaker who is being quoted.",
    );
  }

  // Highest question rate is the clinician. Consultations are asymmetric: the
  // clinician drives, the patient answers. Vocabulary only settles a draw.
  const ranked = profiles.slice().sort(
    (a, b) => b.questionRate - a.questionRate || b.clinicalRate - a.clinicalRate,
  );
  const [top, runnerUp] = ranked;

  const byQuestions = top.questionRate > runnerUp.questionRate;
  const byVocabulary = !byQuestions && top.clinicalRate > runnerUp.clinicalRate;

  if (!byQuestions && !byVocabulary) {
    return unresolved(
      events,
      "tie-unresolved",
      profiles.map((p) => Object.freeze(p)),
      `Slots ${profiles.map((p) => p.slot).join(" and ")} scored identically on question ` +
        `rate and clinical vocabulary, so no role was assigned.`,
    );
  }

  const clinicianSlot = top.slot;
  const assigned = profiles.map((p) =>
    Object.freeze({ ...p, role: (p.slot === clinicianSlot ? "clinician" : "patient") as Speaker }),
  );

  const roleOf = new Map(assigned.map((p) => [p.slot, p.role]));
  const relabelled = events.map((event) => {
    if (event.source !== "speech") return event;
    const slot = slots.get(event.id);
    if (slot === undefined) return event;
    return withSpeaker(event, roleOf.get(slot) ?? "unknown");
  });

  const method: RoleMethod = byQuestions ? "question-density" : "clinical-vocabulary";
  const note = byQuestions
    ? `Slot ${clinicianSlot} asked ${Math.round(top.questionRate * 100)}% questions against ` +
      `${Math.round(runnerUp.questionRate * 100)}%, so it is the clinician; the rest is the patient side.`
    : `Question rates tied at ${Math.round(top.questionRate * 100)}%, so clinical vocabulary decided it: ` +
      `slot ${clinicianSlot} is the clinician.`;

  return Object.freeze({
    events: Object.freeze(relabelled),
    method,
    resolved: true,
    slots: Object.freeze(assigned),
    note,
  });
}
