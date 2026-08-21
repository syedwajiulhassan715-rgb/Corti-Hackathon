// Tests for the ambient live path, driven by a captured Corti message
// sequence. Written before the wiring it exercises.
//
// This is the one stage a rehearsal cannot re-run on demand: it needs a
// microphone, two people and a live socket. So the fixture below is the
// contract — transcript and facts messages in the shape stream.ts declares —
// and the whole ambient decision path has to run offline against it.
//
// No credentials are passed, so no coding call is attempted. Coding is
// fire-and-forget by design and its absence must degrade to a missing badge,
// never a failure (test law).

import { test } from "node:test";
import assert from "node:assert/strict";

import { handleCortiMessage, DEMO_T0, type DemoRun } from "./index.ts";
import { DiskCache } from "../corti/cache.ts";
import type { CortiStreamSocketMessage } from "../corti/stream.ts";
import type { Event, EventId, Millis } from "../contracts/index.ts";

const CACHE = new DiskCache({ dir: "fixtures/corti" });

function run(): DemoRun {
  return {
    runId: "test-run",
    patientId: "elena_petrova",
    room: "room-02",
    mode: "live",
    startedAt: DEMO_T0 as Millis,
    projectionUntil: DEMO_T0 as Millis,
    status: "recording",
    interactionId: "interaction-1",
    stream: null,
    activities: [],
    eventIds: [],
    events: [],
    finalTranscriptKeys: new Set(),
    transcriptSegments: [],
    partialTranscript: null,
    slots: new Map(),
    attribution: null,
    factWindow: [],
    codedEventIds: new Set(),
    groundedKeys: new Set(),
    factKeys: new Set(),
    decisions: new Map(),
    nextAudioSequence: 0,
    monitorStep: 0,
    initialLevel: "GREEN",
    initialRank: 1,
    previousLevel: "GREEN",
    previousRank: 1,
    notificationEventId: null,
    error: null,
  } as DemoRun;
}

/** A finalized ambient segment as Corti sends one. */
function segment(id: string, text: string, speakerId: number, start: number, final = true): CortiStreamSocketMessage {
  return {
    type: "transcript",
    data: [{
      id,
      transcript: text,
      time: { start, end: start + 3 },
      final,
      speakerId,
      participant: { channel: 0 },
    }],
  } as CortiStreamSocketMessage;
}

/**
 * A facts batch as Corti actually sends one: the array key is `fact`,
 * SINGULAR. Reading the plural returned undefined and threw inside the socket
 * handler, which took the whole server down mid-encounter.
 */
function facts(items: readonly { id: string; text: string; group: string }[]): CortiStreamSocketMessage {
  return {
    type: "facts",
    fact: items.map((item) => ({
      ...item,
      isDiscarded: false,
      source: "core",
      createdAt: "2026-08-21T10:00:00Z",
      updatedAt: null,
    })),
  } as CortiStreamSocketMessage;
}

/** Two people, one microphone: the demo conversation. */
const AMBIENT: readonly CortiStreamSocketMessage[] = [
  segment("s1", "How are you feeling today?", 0, 0),
  segment("s2", "I've been more short of breath since this morning.", 1, 4),
  segment("s3", "Any chest pain?", 0, 9),
  segment("s4", "No chest pain, but I'm more tired than yesterday.", 1, 13),
];

function drive(target: DemoRun, messages: readonly CortiStreamSocketMessage[]): void {
  for (const message of messages) handleCortiMessage(target, message, target.events, undefined, CACHE);
}

test("an ambient two-speaker conversation separates into clinician and patient", () => {
  const target = run();

  drive(target, AMBIENT);

  const speech = target.events.filter((event) => event.observation === "utterance");
  assert.equal(speech.length, 4);
  assert.deepEqual(speech.map((event) => event.speaker), ["clinician", "patient", "clinician", "patient"]);
});

test("attribution is announced, so a relabelling is never silent", () => {
  const target = run();

  drive(target, AMBIENT);

  const announced = target.activities.filter((item) => item.type === "roles.resolved" || item.type === "roles.reassigned");
  assert.ok(announced.length >= 1, "the surface is told when roles are decided");
  assert.equal(announced[0]!.source, "ECHO ATTRIBUTION");
});

test("one speaker is refused a role rather than guessed at", () => {
  const target = run();

  drive(target, [segment("s1", "How are you feeling today?", 0, 0)]);

  const speech = target.events.filter((event) => event.observation === "utterance");
  assert.equal(speech[0]!.speaker, "unknown");
  assert.equal(target.attribution?.resolved, false);
});

test("interim segments never enter state", () => {
  const target = run();

  drive(target, [segment("s1", "I've been more short", 1, 0, false)]);

  assert.equal(target.events.length, 0);
  assert.equal(target.partialTranscript, "I've been more short");
});

test("a facts message writes clinical facts into the patient's history", () => {
  const target = run();

  drive(target, AMBIENT);
  drive(target, [facts([
    { id: "f1", text: "Shortness of breath, worse since this morning", group: "symptom" },
    { id: "f2", text: "Fatigue, worse than yesterday", group: "symptom" },
  ])]);

  const created = target.events.filter((event) => event.observation === "corti_fact");
  assert.equal(created.length, 2);
  assert.equal(created[0]!.value, "Shortness of breath, worse since this morning");
  assert.ok(target.activities.some((item) => item.type === "patient_history.updated"));
});

test("each fact carries the segment window it was generated from", () => {
  const target = run();

  drive(target, AMBIENT);
  drive(target, [facts([{ id: "f1", text: "Shortness of breath", group: "symptom" }])]);

  const fact = target.events.find((event) => event.observation === "corti_fact");
  assert.ok(fact, "a fact event was written");
  assert.equal((fact.causedByEventIds ?? []).length, 4, "all four segments since the last batch are the evidence window");

  const utterances = target.events.filter((event) => event.observation === "utterance").map((event) => event.id);
  for (const id of fact.causedByEventIds ?? []) {
    assert.ok(utterances.includes(id as EventId), "every cited id is a real transcript event");
  }
});

test("the evidence window resets, so a later fact does not re-cite spent segments", () => {
  const target = run();

  drive(target, AMBIENT);
  drive(target, [facts([{ id: "f1", text: "Shortness of breath", group: "symptom" }])]);
  drive(target, [segment("s5", "Let me check your saturation.", 0, 20)]);
  drive(target, [facts([{ id: "f2", text: "Saturation check performed", group: "objective" }])]);

  const second = target.events.find((event) => (event as Event).value === "Saturation check performed");
  assert.ok(second, "the later fact was written");
  assert.equal((second.causedByEventIds ?? []).length, 1);
});

test("a duplicated fact id is never written twice", () => {
  const target = run();

  drive(target, AMBIENT);
  const batch = facts([{ id: "f1", text: "Shortness of breath", group: "symptom" }]);
  drive(target, [batch, batch]);

  assert.equal(target.events.filter((event) => event.observation === "corti_fact").length, 1);
});

test("a discarded fact never enters state", () => {
  const target = run();

  drive(target, AMBIENT);
  handleCortiMessage(target, {
    type: "facts",
    fact: [{
      id: "f9", text: "Retracted", group: "symptom", isDiscarded: true,
      source: "core", createdAt: "2026-08-21T10:00:00Z", updatedAt: null,
    }],
  } as CortiStreamSocketMessage, target.events, undefined, CACHE);

  assert.equal(target.events.filter((event) => event.observation === "corti_fact").length, 0);
});

test("replaying the same ambient conversation reproduces the same attribution", () => {
  const a = run();
  const b = run();

  drive(a, AMBIENT);
  drive(b, AMBIENT);

  assert.deepEqual(
    a.events.map((event) => `${event.observation}:${event.speaker}:${event.quote}`),
    b.events.map((event) => `${event.observation}:${event.speaker}:${event.quote}`),
  );
});

test("without credentials no coding is attempted and the encounter still runs", () => {
  const target = run();

  drive(target, AMBIENT);

  assert.equal(target.codedEventIds.size, 0);
  assert.equal(target.events.filter((event) => event.observation === "utterance").length, 4);
  assert.ok(target.events.every((event) => event.code === null));
});

test("the plural alias still works, in case a tenant sends it", () => {
  const target = run();

  drive(target, AMBIENT);
  handleCortiMessage(target, {
    type: "facts",
    facts: [{
      id: "f1", text: "Shortness of breath", group: "symptom", isDiscarded: false,
      source: "core", createdAt: "2026-08-21T10:00:00Z", updatedAt: null,
    }],
  } as CortiStreamSocketMessage, target.events, undefined, CACHE);

  assert.equal(target.events.filter((event) => event.observation === "corti_fact").length, 1);
});

test("a facts message carrying no array at all is survived, not thrown on", () => {
  const target = run();

  drive(target, AMBIENT);
  handleCortiMessage(
    target,
    { type: "facts" } as CortiStreamSocketMessage,
    target.events,
    undefined,
    CACHE,
  );

  assert.equal(target.events.filter((event) => event.observation === "corti_fact").length, 0);
  assert.equal(target.events.filter((event) => event.observation === "utterance").length, 4);
});

test("an unknown message type is ignored and the encounter continues", () => {
  const target = run();

  drive(target, AMBIENT);
  handleCortiMessage(
    target,
    { type: "usage", usage: { seconds: 12 } } as unknown as CortiStreamSocketMessage,
    target.events,
    undefined,
    CACHE,
  );

  assert.equal(target.status, "recording");
  assert.equal(target.events.filter((event) => event.observation === "utterance").length, 4);
});
