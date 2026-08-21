// S2 Role assignment. Diarization slot -> clinician or patient.
//
// Pure function of its arguments. No clock, no network, no stored state (D8).
//
// Paths, and the refusal matters more than the heuristic:
//
//   exactly one slot   -> return the events untouched, speaker 'unknown',
//                         resolved: false
//   one slot claims a  -> pin that slot, no inference involved
//   clinician role
//   anything else      -> decide by question density, tie-broken by clinical
//                         vocabulary, and report which of the two decided it
//
// Self-identification runs first because it is testimony, not inference. A
// clinician who says 'I'm the doctor' has answered the question directly, and
// question density is only ever a proxy for the same fact — a proxy V1 watched
// invert on a clinician who dismisses rather than enquires, where the patient
// asked the only question in the recording. When someone states their role,
// stop guessing.
//
// Two slots both claiming is a contradiction, not a tie to be broken, so it
// falls through to the heuristic rather than picking the louder one.
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

import type { Event, EventId, Millis, Speaker } from "../contracts/index.ts";

export type RoleMethod =
  /** A slot stated its own clinical role out loud. Testimony, not inference. */
  | "self-identification"
  /**
   * Who is addressed versus who reports. A clinician talks ABOUT the patient
   * ("your saturation is 87"); a patient talks about THEMSELVES ("I feel
   * dizzy"). Stronger than turn shape, and checked before it.
   */
  | "address-vs-report"
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
  /** Second-person address ("you", "your") per utterance. */
  readonly secondPersonRate: number;
  /** First-person report ("I", "my") per utterance. */
  readonly firstPersonRate: number;
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

/**
 * Second person: the clinician's register. A consultation is asymmetric in a
 * way that survives a dismissive clinician and an inquisitive patient --
 * whoever is being ASKED ABOUT is the patient, whatever the turn shape.
 */
const SECOND_PERSON = new Set(["you", "your", "yours", "you're", "youre", "you've", "youve"]);

/** First person: the patient's register. Reporting a body from the inside. */
const FIRST_PERSON = new Set(["i", "i'm", "im", "i've", "ive", "my", "me", "mine", "myself"]);

const WORD = /[a-z']+/g;

function isQuestion(quote: string): boolean {
  const text = quote.trim();
  if (text === "") return false;
  if (text.includes("?")) return true;

  const first = text.toLowerCase().match(WORD)?.[0];
  return first !== undefined && INTERROGATIVES.has(first);
}

/** How many words of `vocabulary` this quote uses. */
function pronounHits(quote: string, vocabulary: ReadonlySet<string>): number {
  const words = quote.toLowerCase().match(WORD) ?? [];
  let hits = 0;
  for (const word of words) if (vocabulary.has(word)) hits += 1;
  return hits;
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

/**
 * How long after the first utterance a role claim still counts.
 *
 * Introductions happen at the top of an encounter. Thirty seconds in, 'I'm the
 * doctor' is far more likely to be someone reporting what a doctor said than
 * someone introducing themselves, and a claim we cannot trust is worse than no
 * claim at all — the fallback still works.
 *
 * Measured from the first slotted utterance, not from a clock: this function
 * reads no time of its own (D8).
 */
const SELF_ID_WINDOW_MS = 30_000;

/**
 * How much clearer one slot's address-versus-report gap must be before it is
 * allowed to decide. Below this the two registers are too close to separate
 * honestly, and turn shape gets its turn instead.
 */
const ADDRESS_MARGIN = 0.35;

/**
 * A first-person claim to a clinical role.
 *
 * Deliberately first-person only. 'are you the doctor' and 'the doctor said'
 * are about a clinician, not by one, and neither attributes anything.
 *
 * The trailing lookahead is what stops 'I'm the doctor's daughter' — a family
 * member, not a clinician — from taking the clinician slot. Corti drops
 * apostrophes unpredictably (V1b), so both spellings are excluded.
 *
 * Kept short on purpose. A long list of titles would quietly become a job
 * classifier, and every entry added here is one more way to mislabel evidence.
 */
const ROLE_CLAIM =
  /\b(?:i am|i'm|im)\s+(?:the\s+|your\s+|a\s+|an\s+)?(?:doctor|nurse|consultant|registrar|physician|surgeon|clinician)(?!'?s\b)/i;

interface RoleClaim {
  readonly slot: number;
  readonly eventId: EventId;
  readonly quote: string;
}

/**
 * Every slot that claimed a clinical role inside the opening window, at most
 * one claim each, in slot order.
 *
 * Returning all of them rather than the first is the point: the caller has to
 * be able to tell one claim from two, and two claims must not resolve.
 */
function clinicianClaims(
  events: readonly Event[],
  slots: ReadonlyMap<EventId, number>,
): readonly RoleClaim[] {
  let origin: Millis | undefined;
  for (const event of events) {
    if (event.source !== "speech") continue;
    if (!slots.has(event.id)) continue;
    if (origin === undefined || event.ts < origin) origin = event.ts;
  }
  if (origin === undefined) return [];

  const firstBySlot = new Map<number, RoleClaim>();
  for (const event of events) {
    if (event.source !== "speech") continue;
    const slot = slots.get(event.id);
    if (slot === undefined) continue;
    if (event.ts > origin + SELF_ID_WINDOW_MS) continue;
    if (firstBySlot.has(slot)) continue;
    if (!ROLE_CLAIM.test(event.quote)) continue;
    firstBySlot.set(slot, Object.freeze({ slot, eventId: event.id, quote: event.quote }));
  }
  return [...firstBySlot.values()].sort((a, b) => a.slot - b.slot);
}

/**
 * Pin one slot as the clinician, label every other slot patient side, and
 * relabel the events accordingly. Shared by both resolving paths so that a
 * self-identified assignment and an inferred one are byte-identical in shape.
 */
function resolve(
  events: readonly Event[],
  slots: ReadonlyMap<EventId, number>,
  profiles: readonly SlotProfile[],
  clinicianSlot: number,
  method: RoleMethod,
  note: string,
): RoleAssignment {
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

  return Object.freeze({
    events: Object.freeze(relabelled),
    method,
    resolved: true,
    slots: Object.freeze(assigned),
    note,
  });
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
  const counts = new Map<
    number,
    { utterances: number; questions: number; clinical: number; second: number; first: number }
  >();

  for (const event of events) {
    if (event.source !== "speech") continue;
    const slot = slots.get(event.id);
    if (slot === undefined) continue;

    const tally = counts.get(slot) ?? { utterances: 0, questions: 0, clinical: 0, second: 0, first: 0 };
    tally.utterances += 1;
    if (isQuestion(event.quote)) tally.questions += 1;
    tally.clinical += clinicalHits(event.quote);
    tally.second += pronounHits(event.quote, SECOND_PERSON);
    tally.first += pronounHits(event.quote, FIRST_PERSON);
    counts.set(slot, tally);
  }

  const profiles = [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slot, t]) => ({
      slot,
      utterances: t.utterances,
      questions: t.questions,
      questionRate: t.questions / t.utterances,
      secondPersonRate: t.second / t.utterances,
      firstPersonRate: t.first / t.utterances,
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

  // Testimony first. Someone who stated their role has already answered the
  // question the heuristic below only estimates an answer to.
  const claims = clinicianClaims(events, slots);

  if (claims.length === 1) {
    const claim = claims[0]!;
    return resolve(
      events,
      slots,
      profiles,
      claim.slot,
      "self-identification",
      `Slot ${claim.slot} identified itself as the clinician within the first ` +
        `${SELF_ID_WINDOW_MS / 1000}s: "${claim.quote}" (${claim.eventId}).`,
    );
  }

  // More than one slot claiming a clinical role is a contradiction, and the
  // right response to a contradiction is not to pick a side. Fall through and
  // let the heuristic decide on turn shape instead, which at least reports
  // itself honestly as an inference.

  // Who is being addressed, before who is asking.
  //
  // A real ward recording (fixtures/audio/test_twovoice_01, replayed
  // 2026-08-21) inverted question density outright: the nurse was dismissive
  // and the patient did most of the asking -- "Is that bad?", "Could this be a
  // blood clot?", "You did not answer my question." Turn shape said the
  // patient was the clinician.
  //
  // Register does not invert the same way. A clinician talks ABOUT the person
  // in front of them ("your saturation is 87", "you said your pain was 1 out
  // of 10"); a patient reports a body from the inside ("I feel dizzy", "I'm
  // puffing just sitting here"). An anxious patient asks more questions than a
  // brusque nurse, but they do not start describing the nurse's body.
  //
  // Still an inference, so it reports itself as one, and a margin is required:
  // a narrow gap falls through to turn shape rather than pretending to know.
  const addressRanked = profiles.slice().sort(
    (a, b) => (b.secondPersonRate - b.firstPersonRate) - (a.secondPersonRate - a.firstPersonRate),
  );
  const [addressTop, addressRunnerUp] = addressRanked;
  if (addressTop !== undefined && addressRunnerUp !== undefined) {
    const topGap = addressTop.secondPersonRate - addressTop.firstPersonRate;
    const nextGap = addressRunnerUp.secondPersonRate - addressRunnerUp.firstPersonRate;
    if (topGap - nextGap >= ADDRESS_MARGIN) {
      return resolve(
        events,
        slots,
        profiles,
        addressTop.slot,
        "address-vs-report",
        `Slot ${addressTop.slot} addresses the other speaker ` +
          `(${addressTop.secondPersonRate.toFixed(1)} "you" against ` +
          `${addressTop.firstPersonRate.toFixed(1)} "I" per turn) while slot ` +
          `${addressRunnerUp.slot} reports itself ` +
          `(${addressRunnerUp.firstPersonRate.toFixed(1)} "I" against ` +
          `${addressRunnerUp.secondPersonRate.toFixed(1)} "you"), so slot ` +
          `${addressTop.slot} is the clinician.`,
      );
    }
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
  const method: RoleMethod = byQuestions ? "question-density" : "clinical-vocabulary";
  const note = byQuestions
    ? `Slot ${clinicianSlot} asked ${Math.round(top.questionRate * 100)}% questions against ` +
      `${Math.round(runnerUp.questionRate * 100)}%, so it is the clinician; the rest is the patient side.`
    : `Question rates tied at ${Math.round(top.questionRate * 100)}%, so clinical vocabulary decided it: ` +
      `slot ${clinicianSlot} is the clinician.`;

  return resolve(events, slots, profiles, clinicianSlot, method, note);
}
