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
    patientId: "test_patient",
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

test("two slots: the one who addresses the other becomes the clinician", () => {
  const { events, slots } = conversation(TWO_VOICES);
  const result = assignRoles(events, slots);

  assert.equal(result.resolved, true);
  // Register decides before turn shape now; the assignment is the same one
  // question density used to reach, by a signal that does not invert on an
  // inquisitive patient.
  assert.equal(result.method, "address-vs-report");
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

  // "Are YOU taking", "YOUR chest" against "MY wife says I have been" -- the
  // registers separate before vocabulary is needed.
  assert.equal(result.method, "address-vs-report");
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
  assert.match(resolved.note, /addresses|question/i);

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
    patientId: "test_patient",
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


// -------------------------------------- path 0: a slot states its own role
//
// These use the verbatim room-02_deteriorating_v1 transcript, because that
// recording is the reason this path exists. Question density gets it exactly
// backwards there: the doctor dismisses and never asks, while the patient asks
// both questions in the conversation. The doctor does, however, say who he is
// in the opening sentence.

const ROOM_02: readonly (readonly [number, string])[] = [
  [0, "So good morning Anna Jensen in room one oh one I'm the doctor the chart says that you had a quiet night your CHOX was one and you're doing fine"],
  [1, "I was fine earlier but something has changed I have a sharp pain here in my chest"],
  [0, "you have pneumonia coughing hurts that's hardly surprising"],
  [1, "no this is different I started it started about 20 minutes ago the pain is 9/10 and I cannot catch my breath"],
  [0, "but and yesterday you said your pain was only 1/10"],
  [1, "that was yesterday now it's nine and I'm getting worse"],
  [0, "you're th talking to me and you're getting air it can't be that bad"],
  [1, "but I'm puffing just from sitting here could this be a blood clot"],
];

test("self-identification fires on room-02 and beats the question-density answer", () => {
  const { events, slots } = conversation(ROOM_02);
  const result = assignRoles(events, slots);

  assert.equal(result.method, "self-identification");
  assert.equal(result.resolved, true);

  const clinician = result.slots.find((s) => s.role === "clinician");
  assert.equal(clinician?.slot, 0, "slot 0 said 'I'm the doctor'");
  assert.equal(result.slots.find((s) => s.role === "patient")?.slot, 1);

  // The point of the path: the heuristic would have inverted this. Slot 1 asks
  // the only questions, so question density alone would have crowned it.
  assert.ok(
    clinician!.questionRate <= result.slots.find((s) => s.slot === 1)!.questionRate,
    "slot 0 does not out-question slot 1 — the heuristic would have got this wrong",
  );

  // The note has to carry the utterance that decided it, verbatim, so the
  // evidence line can quote it rather than assert it.
  assert.match(result.note, /I'm the doctor/);
  assert.match(result.note, /slot 0/i);

  for (const event of result.events) {
    const slot = slots.get(event.id)!;
    assert.equal(event.speaker, slot === 0 ? "clinician" : "patient");
  }
});

test("no role claim falls through to the heuristics, unchanged", () => {
  const { events, slots } = conversation(TWO_VOICES);
  const result = assignRoles(events, slots);

  assert.equal(result.method, "address-vs-report");
  assert.equal(result.resolved, true);
  assert.equal(result.slots.find((s) => s.role === "clinician")?.slot, 0);
});

test("two slots both claiming a clinical role falls through rather than picking one", () => {
  const { events, slots } = conversation([
    [0, "I'm the doctor, what brings you in today?"],
    [1, "I'm the nurse, I was with her overnight."],
    [0, "How long has the pain been there?"],
    [1, "Since about four this morning."],
    [0, "Did anything change when she stood up?"],
    [1, "It got worse."],
  ]);
  const result = assignRoles(events, slots);

  // A contradiction is not a tie to be broken. The claim is discarded and the
  // result reports itself honestly as an inference.
  assert.notEqual(result.method, "self-identification");
  assert.equal(result.resolved, true);
  assert.doesNotMatch(result.note, /identified itself/);
});

test("a role claim after the opening window does not count", () => {
  const opening = speech("Right, let us start.", 1000);
  const answer = speech("My chest has been hurting since Tuesday.", 2000);
  const late = speech("I'm the doctor, as I said.", 1000 + 30_001);
  const reply = speech("Does it hurt when you breathe in?", 1000 + 31_000);

  const slots = new Map<EventId, number>([
    [opening.id, 0],
    [answer.id, 1],
    [late.id, 0],
    [reply.id, 1],
  ]);
  const result = assignRoles([opening, answer, late, reply], slots);

  // Slot 0 claims the role, but says it 30s in, so the claim is ignored and
  // slot 1 wins on questions instead.
  assert.notEqual(result.method, "self-identification");
  assert.equal(result.slots.find((s) => s.role === "clinician")?.slot, 1);
});

// ---------------------------------------------------------------------------
// Regression: a REAL two-voice ward recording, replayed through the live path
// on 2026-08-21. Question density inverted on it -- the nurse was dismissive
// and the patient did most of the asking ("Is that bad?", "Could this be a
// blood clot?", "You did not answer my question"), which is the exact failure
// this file's header warned V1 had already seen once.
//
// The transcript below is Corti's own output for fixtures/audio/
// test_twovoice_01, not a hand-written script.

/** Nurse turns: slot 0 in the real recording. */
const NURSE_TURNS = [
  "Good morning, Anna. The chart says that you had a quiet night.",
  "Oh, you have pneumonia.",
  "Coughing hurts. That's hardly surprising.",
  "Oh, yesterday you said your pain was only 1 out of 10. You're telling me it is worse?",
  "Let's not diagnose ourself. I can give you some more pain relief.",
  "Let me look at the new observations.",
  "Your oxygen saturation is 87% despite 2 L of oxygen, respiratory rate 30.",
  "Your news score is seven. This has changed significantly.",
  "Now let's try sitting upright and try not to stand.",
];

/** Patient turns: slot 1 in the real recording. */
const PATIENT_TURNS = [
  "I was fine earlier, but something has changed, I have a sharp chest pain.",
  "No, no, no, it's different. It started about 20 minutes ago.",
  "But, but I'm puffing from just sitting here. Could this be a clot?",
  "No, thank you, I don't, I don't want to just cover the pain.",
  "Again. I feel dizzy too.",
  "Is that bad? Could this be a blood clot?",
  "You did not answer my question.",
  "Please call my daughter as well.",
];

function realConversation(): { events: Event[]; slots: Map<EventId, number> } {
  const events: Event[] = [];
  const slots = new Map<EventId, number>();
  const longer = Math.max(NURSE_TURNS.length, PATIENT_TURNS.length);
  for (let i = 0; i < longer; i++) {
    const nurse = NURSE_TURNS[i];
    if (nurse !== undefined) {
      const event = speech(nurse);
      events.push(event);
      slots.set(event.id, 0);
    }
    const patient = PATIENT_TURNS[i];
    if (patient !== undefined) {
      const event = speech(patient);
      events.push(event);
      slots.set(event.id, 1);
    }
  }
  return { events, slots };
}

test("a real recording where the PATIENT asks most of the questions still attributes correctly", () => {
  const { events, slots } = realConversation();

  const assignment = assignRoles(events, slots);

  assert.equal(assignment.resolved, true);
  const nurseSlot = assignment.slots.find((slot) => slot.slot === 0);
  const patientSlot = assignment.slots.find((slot) => slot.slot === 1);
  assert.equal(nurseSlot?.role, "clinician", "slot 0 is the nurse in this recording");
  assert.equal(patientSlot?.role, "patient", "slot 1 is the patient in this recording");
});

test("who is addressed decides before who asks, because a patient may out-question a nurse", () => {
  const { events, slots } = realConversation();

  const assignment = assignRoles(events, slots);

  assert.equal(assignment.method, "address-vs-report");
});

test("the clinician addresses and the patient reports, and both rates are reported", () => {
  const { events, slots } = realConversation();

  const assignment = assignRoles(events, slots);

  const nurse = assignment.slots.find((slot) => slot.slot === 0)!;
  const patient = assignment.slots.find((slot) => slot.slot === 1)!;
  assert.ok(nurse.secondPersonRate > nurse.firstPersonRate, "the nurse talks about the patient");
  assert.ok(patient.firstPersonRate > patient.secondPersonRate, "the patient talks about themselves");
});

test("self-identification still outranks the address signal", () => {
  const { events, slots } = realConversation();
  // Put a claim on the slot the address signal would NOT choose.
  const claim = speech("I'm the nurse, let me take a look.", 1);
  const withClaim = [claim, ...events];
  const slotsWithClaim = new Map(slots);
  slotsWithClaim.set(claim.id, 1);

  const assignment = assignRoles(withClaim, slotsWithClaim);

  assert.equal(assignment.method, "self-identification");
  assert.equal(assignment.slots.find((slot) => slot.slot === 1)?.role, "clinician");
});

test("question density still decides when neither speaker's register stands out", () => {
  // No "you" and no "I" anywhere: the address signal has nothing to work with
  // and must hand over rather than resolve on noise.
  const { events, slots } = conversation([
    [0, "Any pain overnight?"],
    [1, "Not really."],
    [0, "Any fever?"],
    [1, "No."],
    [0, "Sleeping alright?"],
    [1, "Mostly."],
  ]);

  const result = assignRoles(events, slots);

  assert.equal(result.method, "question-density");
  assert.equal(result.resolved, true);
  assert.equal(result.slots.find((slot) => slot.role === "clinician")?.slot, 0);
});
