// Tests for incremental live attribution. Written before liveAttribution.ts.
//
// The batch path (main.ts) sees every segment before it decides. The ambient
// live path does not: segments arrive one at a time and the decision has to be
// made, and re-made, as evidence accumulates. What matters here is that a
// re-decision is REPORTED, because a surface that silently flips who was
// speaking is worse than one that never decided at all.

import { test } from "node:test";
import assert from "node:assert/strict";

import { attributeLive } from "./liveAttribution.ts";
import type { Event, EventId } from "../contracts/index.ts";

let counter = 0;

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

/** Two-speaker ambient conversation: slot 0 asks, slot 1 reports. */
function conversation(): { events: Event[]; slots: Map<EventId, number> } {
  const events = [
    speech("How are you feeling today?"),
    speech("I've been more short of breath since this morning."),
    speech("Any chest pain?"),
    speech("No chest pain, but I'm more tired than yesterday."),
  ];
  const slots = new Map<EventId, number>([
    [events[0]!.id, 0],
    [events[1]!.id, 1],
    [events[2]!.id, 0],
    [events[3]!.id, 1],
  ]);
  return { events, slots };
}

test("one slot refuses to attribute, and reports the refusal", () => {
  const first = speech("How are you feeling today?");
  const slots = new Map<EventId, number>([[first.id, 0]]);

  const result = attributeLive([first], slots, null);

  assert.equal(result.assignment.resolved, false);
  assert.equal(result.assignment.method, "single-slot-unresolved");
  assert.equal(result.events[0]!.speaker, "unknown");
  assert.equal(result.newlyResolved, false);
});

test("a second speaker resolves the conversation into clinician and patient", () => {
  const { events, slots } = conversation();

  const result = attributeLive(events, slots, null);

  assert.equal(result.assignment.resolved, true);
  assert.equal(result.events[0]!.speaker, "clinician");
  assert.equal(result.events[1]!.speaker, "patient");
  assert.equal(result.events[2]!.speaker, "clinician");
  assert.equal(result.events[3]!.speaker, "patient");
});

test("resolving for the first time is reported as newly resolved", () => {
  const { events, slots } = conversation();

  const before = attributeLive(events.slice(0, 1), new Map([[events[0]!.id, 0]]), null);
  const after = attributeLive(events, slots, before.assignment);

  assert.equal(before.assignment.resolved, false);
  assert.equal(after.newlyResolved, true);
  assert.equal(after.changed, true);
});

test("a steady attribution is not reported as changed, so the surface stays quiet", () => {
  const { events, slots } = conversation();

  const first = attributeLive(events, slots, null);
  const second = attributeLive(events, slots, first.assignment);

  assert.equal(second.changed, false);
  assert.equal(second.newlyResolved, false);
});

test("a flipped attribution is reported as changed", () => {
  // Slot 1 starts as the only questioner, so it reads as the clinician. Slot 0
  // then asks three questions in a row and takes the role over. The flip is
  // exactly what has to be announced rather than applied silently.
  const a = speech("Is the pain worse?");
  const b = speech("Yes it is.");
  const early = new Map<EventId, number>([[a.id, 1], [b.id, 0]]);
  const first = attributeLive([a, b], early, null);
  assert.equal(first.assignment.resolved, true);
  assert.equal(first.events[0]!.speaker, "clinician");

  const c = speech("How long has that been going on?");
  const d = speech("What makes it worse?");
  const e = speech("Can you take a deep breath for me?");
  // Slot 1 keeps talking, but only ever reports. Its question RATE falls below
  // slot 0's, which is what turns the early reading over.
  const f = speech("It started last night.");
  const g = speech("Lying flat makes it worse.");
  const h = speech("I can manage a shallow one.");
  const later = new Map<EventId, number>([
    [a.id, 1], [b.id, 0], [c.id, 0], [d.id, 0], [e.id, 0],
    [f.id, 1], [g.id, 1], [h.id, 1],
  ]);
  const second = attributeLive([a, b, c, d, e, f, g, h], later, first.assignment);

  assert.equal(second.assignment.resolved, true);
  assert.equal(second.events[0]!.speaker, "patient");
  assert.equal(second.changed, true);
  assert.equal(second.newlyResolved, false);
});

test("non-speech events pass through untouched and are never attributed", () => {
  const { events, slots } = conversation();
  const vital: Event = Object.freeze({
    id: "e_vital_1" as EventId,
    ts: 9_000,
    patientId: "test_patient",
    room: "room-1",
    source: "vital",
    speaker: "unknown",
    quote: "",
    code: null,
    observation: "spo2",
    value: 93,
  } satisfies Event);

  const result = attributeLive([...events, vital], slots, null);

  const passed = result.events.find((event) => event.id === vital.id);
  assert.equal(passed!.speaker, "unknown");
  assert.equal(passed!.value, 93);
});

test("attribution is deterministic: identical input, identical output", () => {
  const { events, slots } = conversation();

  const a = attributeLive(events, slots, null);
  const b = attributeLive(events, slots, null);

  assert.deepEqual(
    a.events.map((event) => event.speaker),
    b.events.map((event) => event.speaker),
  );
  assert.equal(a.assignment.method, b.assignment.method);
});

test("an empty run attributes nothing and does not throw", () => {
  const result = attributeLive([], new Map(), null);

  assert.equal(result.assignment.resolved, false);
  assert.equal(result.assignment.method, "no-speech-unresolved");
  assert.equal(result.events.length, 0);
});
