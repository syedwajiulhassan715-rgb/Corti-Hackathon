// Tests for role assignment. Written before roles.ts.
//
// Two paths, and the important one is the refusal: a single diarization slot
// must never become a role. V1 and V1b left diarization unproven, so the demo
// has to be able to say out loud which path it took.

import { test } from "node:test";
import assert from "node:assert/strict";

import { assignRoles } from "./roles.ts";
import type { Event, EventId } from "../contracts/index.ts";

let counter = 0;

/** A speech event as transcribe.ts produces one: speaker always 'unknown'. */
function speech(quote: string, ts = ++counter * 1000): Event {
  return Object.freeze({
    id: `e_${String(++counter).padStart(6, "0")}` as EventId,
    ts,
    room: "room-1",
    source: "speech",
    speaker: "unknown",
    quote,
    code: null,
    observation: "utterance",
    value: null,
  } satisfies Event);
}

/** Builds the events plus the slot map, the way the caller would from a transcript. */
function conversation(turns: readonly (readonly [number, string])[]): {
  events: Event[];
  slots: Map<EventId, number>;
} {
  const events: Event[] = [];
  const slots = new Map<EventId, number>();
  for (const [slot, quote] of turns) {
    const event = speech(quote);
    events.push(event);
    slots.set(event.id, slot);
  }
  return { events, slots };
}

const TWO_VOICES: readonly (readonly [number, string])[] = [
  [0, "Good morning, what brings you in today?"],
  [1, "I've had this pain across my chest since Tuesday."],
  [0, "How long does it last when it comes on?"],
  [1, "Maybe ten minutes, then it settles."],
  [0, "Does anything bring it on, walking, stairs?"],
  [1, "Stairs mostly. I get out of breath as well."],
  [0, "Any nausea or sweating with it?"],
  [1, "No, nothing like that."],
  [0, "I am going to examine you and check your blood pressure."],
  [1, "That's fine."],
];

// ------------------------------------------------- path 1: two or more slots

test("two slots: the higher question rate becomes the clinician", () => {
  const { events, slots } = conversation(TWO_VOICES);
  const result = assignRoles(events, slots);

  assert.equal(result.resolved, true);
  assert.equal(result.method, "question-density");
  assert.deepEqual(
    result.events.map((e) => e.speaker),
    ["clinician", "patient", "clinician", "patient", "clinician", "patient", "clinician", "patient", "clinician", "patient"],
  );
});

test("the remainder becomes the patient, whichever slot number it is", () => {
  // Same conversation, slot numbers swapped: the roles must follow the voice.
  const swapped = TWO_VOICES.map(([slot, quote]) => [slot === 0 ? 7 : 3, quote] as const);
  const { events, slots } = conversation(swapped);
  const result = assignRoles(events, slots);

  assert.equal(result.resolved, true);
  assert.equal(result.events[0].speaker, "clinician", "slot 7 asks the questions");
  assert.equal(result.events[1].speaker, "patient");
});

test("question detection does not depend on question marks", () => {
  // V1b: some speakers dictate no punctuation at all, so '?' cannot be required.
  const { events, slots } = conversation([
    [0, "how long has this been going on"],
    [0, "does it wake you at night"],
    [0, "any fever with it"],
    [1, "about three days now"],
    [1, "it woke me twice"],
    [1, "no fever that I noticed"],
  ]);
  const result = assignRoles(events, slots);

  assert.equal(result.resolved, true);
  assert.equal(result.events[0].speaker, "clinician");
  assert.equal(result.events[3].speaker, "patient");
});

test("clinical vocabulary breaks a tie when question rates are equal", () => {
  const { events, slots } = conversation([
    [0, "Are you taking the amlodipine 5 mg daily as prescribed?"],
    [0, "I will auscultate your chest and record the blood pressure."],
    [1, "Is that the white tablet?"],
    [1, "My wife says I have been snoring."],
  ]);
  const result = assignRoles(events, slots);

  assert.equal(result.method, "clinical-vocabulary");
  assert.equal(result.resolved, true);
  assert.equal(result.events[0].speaker, "clinician");
  assert.equal(result.events[2].speaker, "patient");
});

test("a genuine tie is left unresolved rather than guessed", () => {
  const { events, slots } = conversation([
    [0, "Okay."],
    [1, "Okay."],
  ]);
  const result = assignRoles(events, slots);

  assert.equal(result.resolved, false);
  assert.equal(result.method, "tie-unresolved");
  assert.deepEqual(result.events.map((e) => e.speaker), ["unknown", "unknown"]);
});

test("three slots: the questioner is the clinician, everyone else is patient side", () => {
  const { events, slots } = conversation([
    [0, "What has changed since last week?"],
    [0, "Are you managing the stairs at home?"],
    [1, "I am slower than I was."],
    [2, "He has been struggling, doctor."],
  ]);
  const result = assignRoles(events, slots);

  assert.equal(result.resolved, true);
  assert.deepEqual(
    result.events.map((e) => e.speaker),
    ["clinician", "clinician", "patient", "patient"],
  );
  assert.equal(result.slots.length, 3);
});

// ------------------------------------------------------ path 2: single slot

test("one slot: events come back untouched, speaker still unknown", () => {
  const { events, slots } = conversation([
    [0, "Reason for consultation, evaluation of chronic kidney disease."],
    [0, "The patient reports fatigue and swelling in her lower extremities."],
    [0, "How long has this been going on, she was asked at the last visit."],
  ]);
  const result = assignRoles(events, slots);

  assert.equal(result.resolved, false);
  assert.equal(result.method, "single-slot-unresolved");
  assert.deepEqual(result.events.map((e) => e.speaker), ["unknown", "unknown", "unknown"]);
  assert.deepEqual(result.events, events, "a single slot must be returned entirely unchanged");
});

test("one slot stays unresolved even when it is full of questions", () => {
  const { events, slots } = conversation([
    [0, "How long has this been going on?"],
    [0, "Does it wake you at night?"],
    [0, "Any fever?"],
  ]);
  const result = assignRoles(events, slots);

  assert.equal(result.resolved, false);
  assert.equal(result.method, "single-slot-unresolved");
  assert.ok(result.events.every((e) => e.speaker === "unknown"), "never guess from one slot");
});

test("an empty input is unresolved, not a crash", () => {
  const result = assignRoles([], new Map());
  assert.equal(result.resolved, false);
  assert.equal(result.method, "no-speech-unresolved");
  assert.deepEqual(result.events, []);
});

// -------------------------------------------------------- result and purity

test("the result reports the method and a note the demo can read out", () => {
  const { events, slots } = conversation(TWO_VOICES);
  const resolved = assignRoles(events, slots);
  assert.match(resolved.note, /question/i);

  const single = conversation([[0, "One voice only."]]);
  const unresolved = assignRoles(single.events, single.slots);
  assert.match(unresolved.note, /one diarization slot|single/i);
});

test("per-slot evidence is returned so the UI can show why", () => {
  const { events, slots } = conversation(TWO_VOICES);
  const result = assignRoles(events, slots);

  assert.equal(result.slots.length, 2);
  const clinician = result.slots.find((s) => s.role === "clinician");
  const patient = result.slots.find((s) => s.role === "patient");
  assert.ok(clinician && patient);
  assert.equal(clinician.utterances, 5);
  assert.ok(
    clinician.questionRate > patient.questionRate,
    "the evidence must actually support the assignment",
  );
});

test("assignRoles is pure — inputs are not mutated and output is frozen", () => {
  const { events, slots } = conversation(TWO_VOICES);
  const result = assignRoles(events, slots);

  assert.ok(events.every((e) => e.speaker === "unknown"), "the input array must be untouched");
  assert.throws(() => {
    (result.events[0] as { speaker: string }).speaker = "nurse";
  });
});

test("assignRoles is deterministic — same input, same result twice", () => {
  const { events, slots } = conversation(TWO_VOICES);
  assert.deepEqual(assignRoles(events, slots), assignRoles(events, slots));
});

test("everything except quote and speaker survives assignment", () => {
  const { events, slots } = conversation(TWO_VOICES);
  const result = assignRoles(events, slots);

  for (const [i, event] of result.events.entries()) {
    assert.equal(event.id, events[i].id);
    assert.equal(event.ts, events[i].ts);
    assert.equal(event.quote, events[i].quote);
    assert.equal(event.room, events[i].room);
    assert.equal(event.source, "speech");
    assert.equal(event.code, events[i].code);
  }
});

test("non-speech events pass through untouched and do not skew the counts", () => {
  const { events, slots } = conversation(TWO_VOICES);
  const vital: Event = Object.freeze({
    id: "e_999999",
    ts: 500,
    room: "room-1",
    source: "vital",
    speaker: "unknown",
    quote: "",
    code: null,
    observation: "spo2",
    value: 91,
  });
  const result = assignRoles([vital, ...events], slots);

  assert.equal(result.events[0].speaker, "unknown", "a vital has no speaker to assign");
  assert.equal(result.events[0].source, "vital");
  assert.equal(result.resolved, true);
  assert.equal(result.slots.reduce((n, s) => n + s.utterances, 0), 10);
});
