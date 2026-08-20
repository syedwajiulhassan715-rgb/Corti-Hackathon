// Tests for Patient State against CLINICAL.md §2. Written before the engine.
//
// Five properties carry the clinical safety of this engine:
//   one speaker with a new symptom is enough for YELLOW
//   a severe statement reaches RED without waiting for anyone
//   a feed reading alone never raises a level
//   RED never steps straight to GREEN
//   the same speaker repeating themselves is not a second source

import { test } from "node:test";
import assert from "node:assert/strict";

import { patientState } from "./patientState.ts";
import {
  DEESCALATION,
  SIGNIFICANT_CHANGE,
  SPEECH,
  SPOKEN,
  OBSERVATION,
  toksBand,
} from "./rules/patient.rules.ts";
import type { Event, Source, Speaker } from "../contracts/index.ts";

let seq = 0;
const T = 10_000_000;
const MIN = 60_000;

function base(over: Partial<Event> & { ts: number }): Event {
  seq += 1;
  return Object.freeze({
    id: `e_${String(seq).padStart(6, "0")}`,
    room: "room-1",
    source: "speech" as Source,
    speaker: "patient" as Speaker,
    quote: "",
    code: null,
    observation: "utterance",
    value: null,
    ...over,
  } satisfies Event);
}

/** A spoken symptom, attributed. */
function symptom(ts: number, speaker: Speaker = "patient", quote = "My chest hurts more than yesterday."): Event {
  return base({ ts, speaker, source: "speech", observation: SPEECH.symptom, quote });
}

/** A spoken severe statement. */
function severe(ts: number, speaker: Speaker = "patient", quote = "I cannot breathe."): Event {
  return base({ ts, speaker, source: "speech", observation: SPEECH.severeStatement, quote });
}

/** A structured TOKS/NEWS score. Feed only — never from speech. */
function toks(ts: number, value: number): Event {
  return base({ ts, source: "vital", speaker: "unknown", observation: OBSERVATION.toks, value });
}

function reassessment(ts: number): Event {
  return base({ ts, source: "action", speaker: "clinician", observation: OBSERVATION.reassessment, quote: "Reassessed at the bedside." });
}

const ROOM = { room: "room-1" } as const;

// ------------------------------------------------ speech raises, feeds do not

test("one new symptom from one speaker is enough for YELLOW", () => {
  const s = symptom(T);
  const state = patientState([s], T + 1, ROOM);

  assert.equal(state.level, "yellow");
  assert.deepEqual(state.evidence, [s.id]);
  assert.equal(state.changed_at, s.ts);
  assert.equal(SPOKEN.oneSpeakerSymptomSufficientForYellow, true);
});

test("a lab value alone cannot raise a level", () => {
  const feeds = [
    base({ ts: T, source: "lab", speaker: "unknown", observation: "pao2", value: 7.1 }),
    base({ ts: T + MIN, source: "vital", speaker: "unknown", observation: "resp_rate", value: 32 }),
    base({ ts: T + 2 * MIN, source: "vital", speaker: "unknown", observation: "spo2", value: 86 }),
  ];
  const state = patientState(feeds, T + 10 * MIN, ROOM);

  assert.equal(state.level, "green");
  assert.deepEqual(state.evidence, []);
});

test("a TOKS score alone cannot raise a level, however high", () => {
  // The consequence of 'non-speech may corroborate but never raise alone'.
  const state = patientState([toks(T, 9)], T + 1, ROOM);
  assert.equal(state.level, "green");
  assert.equal(state.toks_direction, "unknown", "one score gives no direction");
  assert.match(state.reason_text, /no speech/i);
});

test("an unattributed utterance is not 'one speaker'", () => {
  const state = patientState([symptom(T, "unknown")], T + 1, ROOM);
  assert.equal(state.level, "green");
});

// ------------------------------------------------------------ TOKS bands

test("speech plus an abnormal TOKS takes the level from the band", () => {
  const events = [toks(T, 5), symptom(T + MIN)];
  const state = patientState(events, T + 2 * MIN, ROOM);

  assert.equal(state.level, "red-urgent", "TOKS 5 is RED-URGENT once speech has raised");
  assert.ok(state.evidence.includes(events[0].id), "the score is cited");
  assert.ok(state.evidence.includes(events[1].id), "so is the utterance that raised it");
});

test("speech with a normal TOKS is still YELLOW, never below", () => {
  const state = patientState([toks(T, 1), symptom(T + MIN)], T + 2 * MIN, ROOM);
  assert.equal(state.level, "yellow", "a new symptom is a YELLOW criterion in its own right");
});

test("TOKS 7 or more with speech is RED-EMERGENCY", () => {
  const state = patientState([toks(T, 7), symptom(T + MIN)], T + 2 * MIN, ROOM);
  assert.equal(state.level, "red-emergency");
});

test("the band table matches CLINICAL", () => {
  assert.equal(toksBand(0), "green");
  assert.equal(toksBand(2), "green");
  assert.equal(toksBand(3), "yellow");
  assert.equal(toksBand(4), "yellow");
  assert.equal(toksBand(5), "red-urgent");
  assert.equal(toksBand(6), "red-urgent");
  assert.equal(toksBand(7), "red-emergency");
  assert.equal(toksBand(12), "red-emergency");
});

// ------------------------------------------------------- severe statements

test("a severe statement reaches RED without a second speaker", () => {
  const s = severe(T);
  const state = patientState([s], T + 1, ROOM);

  assert.ok(state.level.startsWith("red"), `expected red, got ${state.level}`);
  assert.deepEqual(state.evidence, [s.id]);
  assert.match(state.reason_text, /verification/i);
});

test("a severe statement does not wait for a TOKS score either", () => {
  const state = patientState([severe(T)], T + 1, ROOM);
  assert.ok(state.level.startsWith("red"));
  assert.equal(state.toks_direction, "unknown");
});

test("a severe statement fires even when the speaker is unattributed", () => {
  // Safety beats attribution here: CLINICAL says do not wait.
  const state = patientState([severe(T, "unknown")], T + 1, ROOM);
  assert.ok(state.level.startsWith("red"));
});

// ------------------------------------------------------------ corroboration

test("repetition by the same speaker does not count as corroboration", () => {
  const events = [symptom(T), symptom(T + 2 * MIN), symptom(T + 4 * MIN)];
  const state = patientState(events, T + 5 * MIN, ROOM);

  assert.equal(state.level, "yellow", "three utterances from one voice are still one source");
  assert.equal(state.corroborated, false);
  assert.match(state.reason_text, /strengthen/i);
  assert.equal(SPOKEN.repetitionCorroborates, false);
});

test("two different speakers do corroborate", () => {
  const events = [symptom(T, "patient"), symptom(T + 2 * MIN, "nurse")];
  const state = patientState(events, T + 3 * MIN, ROOM);

  assert.equal(state.corroborated, true);
  assert.equal(state.level, "yellow");
  assert.equal(SPOKEN.twoSpeakersCorroborate, true);
});

test("corroboration does not by itself change the level", () => {
  const one = patientState([symptom(T)], T + 1, ROOM);
  const two = patientState([symptom(T), symptom(T + MIN, "nurse")], T + 2 * MIN, ROOM);
  assert.equal(one.level, two.level, "it strengthens the evidence, it does not escalate");
});

// -------------------------------------------------------------- direction

test("TOKS direction is read from the structured scores only", () => {
  const worse = patientState([toks(T, 2), toks(T + 30 * MIN, 5), symptom(T + 31 * MIN)], T + 32 * MIN, ROOM);
  assert.equal(worse.toks_direction, "worsening");

  const better = patientState([toks(T, 5), toks(T + 30 * MIN, 2)], T + 31 * MIN, ROOM);
  assert.equal(better.toks_direction, "improving");

  const same = patientState([toks(T, 3), toks(T + 30 * MIN, 3)], T + 31 * MIN, ROOM);
  assert.equal(same.toks_direction, "stable");

  const one = patientState([toks(T, 3)], T + 1, ROOM);
  assert.equal(one.toks_direction, "unknown");
});

test("a two-point change inside four hours is flagged significant", () => {
  const inside = patientState(
    [toks(T, 1), toks(T + SIGNIFICANT_CHANGE.windowMs, 3), symptom(T + SIGNIFICANT_CHANGE.windowMs + 1)],
    T + SIGNIFICANT_CHANGE.windowMs + 2,
    ROOM,
  );
  assert.equal(inside.significant_change, true);
  assert.equal(SIGNIFICANT_CHANGE.points, 2);

  const outside = patientState(
    [toks(T, 1), toks(T + SIGNIFICANT_CHANGE.windowMs + 1, 3), symptom(T + SIGNIFICANT_CHANGE.windowMs + 2)],
    T + SIGNIFICANT_CHANGE.windowMs + 3,
    ROOM,
  );
  assert.equal(outside.significant_change, false);
});

// ------------------------------------------------------------ de-escalation

test("RED cannot transition to GREEN in one step", () => {
  // Everything has resolved and the score is normal; it still may not be green.
  const events = [toks(T, 1), toks(T + 90 * MIN, 1)];
  const state = patientState(events, T + 91 * MIN, { ...ROOM, previousLevel: "red-urgent" });

  assert.notEqual(state.level, "green");
  assert.equal(DEESCALATION.redMayGoDirectlyToGreen, false);
  assert.match(state.reason_text, /de-escalat/i);
});

test("RED to YELLOW needs documented improvement and a reassessment", () => {
  const improving = [toks(T, 6), toks(T + 30 * MIN, 2)];
  const withoutReassessment = patientState(improving, T + 31 * MIN, { ...ROOM, previousLevel: "red-urgent" });
  assert.equal(withoutReassessment.level, "red-urgent", "improvement alone does not release RED");

  const withReassessment = patientState(
    [...improving, reassessment(T + 40 * MIN)],
    T + 41 * MIN,
    { ...ROOM, previousLevel: "red-urgent" },
  );
  assert.equal(withReassessment.level, "yellow");
});

test("YELLOW to GREEN needs two observation sets at least 60 minutes apart", () => {
  const tooClose = [toks(T, 1), toks(T + 30 * MIN, 1)];
  assert.equal(
    patientState(tooClose, T + 31 * MIN, { ...ROOM, previousLevel: "yellow" }).level,
    "yellow",
    "30 minutes apart is not enough",
  );

  const farEnough = [toks(T, 1), toks(T + DEESCALATION.yellowToGreen.minGapMs, 1)];
  assert.equal(
    patientState(farEnough, T + DEESCALATION.yellowToGreen.minGapMs + 1, { ...ROOM, previousLevel: "yellow" }).level,
    "green",
  );
  assert.equal(DEESCALATION.yellowToGreen.observationSets, 2);
});

test("a worsening observation set does not release YELLOW", () => {
  const worsening = [toks(T, 1), toks(T + 90 * MIN, 4)];
  const state = patientState(worsening, T + 91 * MIN, { ...ROOM, previousLevel: "yellow" });
  assert.equal(state.level, "yellow");
});

test("de-escalation never blocks an escalation", () => {
  const state = patientState([severe(T)], T + 1, { ...ROOM, previousLevel: "green" });
  assert.ok(state.level.startsWith("red"), "coming from green must not damp a severe statement");
});

// ------------------------------------------------- shape, rooms, purity

test("the returned shape is the contract plus direction", () => {
  const state = patientState([symptom(T)], T + 1, { ...ROOM, previousLevel: "green" });
  assert.deepEqual(Object.keys(state).sort(), [
    "changed_at", "corroborated", "evidence", "level", "previous_level",
    "reason_text", "response", "room", "significant_change", "toks_direction",
  ]);
  assert.equal(state.previous_level, "green");
  assert.equal(state.room, "room-1");
});

test("the response times come from CLINICAL and travel with the level", () => {
  const yellow = patientState([symptom(T)], T + 1, ROOM);
  assert.equal(yellow.response.notifyWithinMs, 15 * MIN);
  assert.equal(yellow.response.reassessWithinMs, 60 * MIN);

  const green = patientState([], T, ROOM);
  assert.equal(green.response.reassessWithinMs, 12 * 60 * MIN, "TOKS 0 or unknown: 12 hours");
});

test("another room's events do not raise this room", () => {
  const elsewhere = [symptom(T), severe(T + MIN)].map((e) => ({ ...e, room: "room-2" }));
  assert.equal(patientState(elsewhere, T + 2 * MIN, ROOM).level, "green");
});

test("events after now are invisible", () => {
  const s = symptom(T);
  assert.equal(patientState([s], s.ts - 1, ROOM).level, "green");
  assert.equal(patientState([s], s.ts, ROOM).level, "yellow");
});

test("patientState is pure, deterministic and frozen", () => {
  const events = [toks(T, 5), symptom(T + MIN)];
  const a = patientState(events, T + 2 * MIN, ROOM);
  const b = patientState(events, T + 2 * MIN, ROOM);
  assert.deepEqual(a, b);
  assert.throws(() => {
    (a as { level: string }).level = "green";
  });
});

test("speech never supplies a TOKS score", () => {
  // Even if an utterance claims a number, it cannot become the score.
  // V1 RESOLVED: dictated 'TOKS is seven' transcribed as 'neurotoxic seven'.
  const spokenScore = base({
    ts: T, source: "speech", speaker: "clinician",
    observation: OBSERVATION.toks, value: 9, quote: "your neurotoxic seven this is changed significantly",
  });
  const state = patientState([spokenScore], T + 1, ROOM);

  assert.equal(state.toks_direction, "unknown", "no structured score exists");
  assert.notEqual(state.level, "red-emergency", "a spoken number must not become a band");
  assert.equal(SPOKEN.neverInventToksFromSpeech, true);
});
