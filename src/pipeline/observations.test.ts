// Tests for candidate proposal.
//
// The point of this stage is restraint, so most of these assert that something
// does NOT become a fact. A proposer that emits a claim for every utterance
// would pass a "does it produce candidates" test and be useless.

import { test } from "node:test";
import assert from "node:assert/strict";

import { propose, CODE_OBSERVATIONS, PHRASE_OBSERVATIONS } from "./observations.ts";
import { ground } from "./grounding.ts";
import { SPEECH } from "../engines/rules/patient.rules.ts";
import type { Event, EventId, Speaker } from "../contracts/index.ts";

let counter = 0;

function utterance(
  quote: string,
  speaker: Speaker,
  code: string | null = null,
  room = "room-02",
): Event {
  return Object.freeze({
    id: `e_${String(++counter).padStart(6, "0")}` as EventId,
    ts: counter * 1000,
    patientId: "test_patient",
    room,
    source: "speech",
    speaker,
    quote,
    code,
    observation: "utterance",
    value: null,
  } satisfies Event);
}

// ------------------------------------------------------------- vocabulary

test("the observation names still match the doctor's rules file", () => {
  const proposed = new Set([
    ...CODE_OBSERVATIONS.map((c) => c.observation),
    ...PHRASE_OBSERVATIONS.map((p) => p.observation),
  ]);
  const known: ReadonlySet<string> = new Set<string>(Object.values(SPEECH));

  for (const name of proposed) {
    assert.ok(
      known.has(name),
      `observations.ts proposes "${name}", which patient.rules.ts SPEECH does not recognise`,
    );
  }
});

// ------------------------------------------------------------- proposing

test("a coded patient symptom becomes one candidate citing its utterance", () => {
  const event = utterance("I have a sharp pain here in my chest", "patient", "R07.89");
  const [candidate, ...rest] = propose([event]);

  assert.equal(rest.length, 0);
  assert.equal(candidate!.observation, "symptom");
  assert.equal(candidate!.sourceEventId, event.id);
  assert.equal(candidate!.expectedSpeaker, "patient");
  assert.equal(candidate!.room, "room-02");
  assert.equal(candidate!.value, null, "speech never carries a measurement");
});

test("one utterance can carry two different claims", () => {
  const event = utterance(
    "you have changed significantly I'm calling the acute team now",
    "clinician",
  );
  const proposed = propose([event]);

  assert.deepEqual(
    proposed.map((c) => c.observation).sort(),
    ["emergency_request", "hcp_concern"],
  );
  for (const candidate of proposed) assert.equal(candidate.sourceEventId, event.id);
});

test("every phrase candidate quotes words the utterance actually contains", () => {
  const event = utterance("please check why I cannot breathe", "patient");
  const [candidate] = propose([event]);

  assert.equal(candidate!.observation, "severe_statement");
  assert.ok(candidate!.quote !== undefined);
  assert.ok(
    event.quote.toLowerCase().includes(candidate!.quote!.toLowerCase()),
    "the gate checks this, so the proposer must not invent it",
  );
});

// --------------------------------------------------------------- restraint

test("no number is ever read out of speech", () => {
  const spoken = [
    utterance("your new TOX value is seven so you have changed significantly", "clinician"),
    utterance(
      "your oxygen saturation is 80 f 7% despite 2 L of oxygen respiratory rate 30 pulse 180",
      "clinician",
      "R09.02",
    ),
  ];

  for (const candidate of propose(spoken)) {
    assert.equal(candidate.value, null, `${candidate.id} carried a value out of speech`);
  }
});

test("a measurement read aloud by a clinician proposes nothing", () => {
  const event = utterance("respiratory rate 30 pulse 180", "clinician", "R06.82");
  assert.deepEqual(propose([event]), []);
});

test("a known diagnosis mentioned out loud is not a new symptom", () => {
  const event = utterance("you have pneumonia coughing hurts", "clinician", "J18.9");
  assert.deepEqual(
    propose([event]).map((c) => c.observation),
    [],
    "J18.9 is deliberately absent from the code table",
  );
});

test("non-speech events propose nothing", () => {
  const vital: Event = Object.freeze({
    id: "e_999999",
    ts: 1,
    patientId: "test_patient",
    room: "room-02",
    source: "vital",
    speaker: "unknown",
    quote: "",
    code: null,
    observation: "spo2",
    value: 87,
  });
  assert.deepEqual(propose([vital]), []);
});

test("an empty log proposes nothing, rather than crashing", () => {
  assert.deepEqual(propose([]), []);
});

// ------------------------------------------------- proposing is not deciding

test("the proposer sets expectedSpeaker from the claim, not from who spoke", () => {
  // Same code, said by the clinician. The claim still requires the patient,
  // which is what lets the gate throw it out.
  const event = utterance("coughing hurts", "clinician", "R05.9");
  const [candidate] = propose([event]);

  assert.equal(candidate!.expectedSpeaker, "patient");
  assert.equal(event.speaker, "clinician");
});

test("a clinician-voiced symptom is discarded by the gate as wrong-speaker", () => {
  const event = utterance("coughing hurts", "clinician", "R05.9");
  const result = ground(propose([event]), [event]);

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded.length, 1);
  assert.equal(result.discarded[0]!.reason, "wrong-speaker");
});

test("the same claim from the patient survives the gate and quotes the event", () => {
  const event = utterance("coughing hurts", "patient", "R05.9");
  const result = ground(propose([event]), [event]);

  assert.equal(result.discarded.length, 0);
  assert.equal(result.grounded.length, 1);
  assert.equal(result.grounded[0]!.quote, event.quote, "the quote comes from the log");
  assert.equal(result.grounded[0]!.speaker, "patient");
});

test("an unresolved speaker refuses rather than assumes", () => {
  const event = utterance("I have a sharp pain here in my chest", "unknown", "R07.89");
  const result = ground(propose([event]), [event]);

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded[0]!.reason, "speaker-unresolved");
});

// ------------------------------------------------------------------ purity

test("propose is pure — input untouched, output frozen, deterministic", () => {
  const events = [
    utterance("I cannot catch my breath", "patient", "R06.02"),
    utterance("I'm calling the acute team", "clinician"),
  ];
  const snapshot = JSON.stringify(events);

  const first = propose(events);
  const second = propose(events);

  assert.equal(JSON.stringify(events), snapshot, "inputs were mutated");
  assert.ok(Object.isFrozen(first));
  assert.deepEqual(first, second);
});

test("candidate ids are deterministic and trace back to the event", () => {
  const event = utterance("I have a sharp pain here in my chest", "patient", "R07.89");
  const [candidate] = propose([event]);

  assert.equal(candidate!.id, `c_${event.id}_symptom`);
});
