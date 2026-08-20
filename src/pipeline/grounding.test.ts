// Tests for grounding. Written before grounding.ts.
//
// Grounding is the gate: a candidate either has a real utterance behind it or
// it does not exist. Nothing is downgraded, flagged, or shown greyed out. The
// discard list is a separate channel because refusing well is a feature — the
// demo shows that list out loud.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ground } from "./grounding.ts";
import type { Candidate } from "./grounding.ts";
import type { Event, Speaker } from "../contracts/index.ts";

function event(
  id: string,
  overrides: Partial<Event> = {},
): Event {
  return Object.freeze({
    id,
    ts: 5000,
    room: "room-1",
    source: "speech",
    speaker: "patient" as Speaker,
    quote: "The pain is about a seven now, mostly when I walk up the stairs.",
    code: null,
    observation: "utterance",
    value: null,
    ...overrides,
  } satisfies Event);
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "c1",
    room: "room-1",
    observation: "pain_score",
    value: 7,
    expectedSpeaker: "patient",
    sourceEventId: "e_000001",
    ...overrides,
  };
}

// ------------------------------------------------------------- it survives

test("a supported candidate survives and carries the verbatim quote", () => {
  const utterance = event("e_000001");
  const result = ground([candidate()], [utterance]);

  assert.equal(result.grounded.length, 1);
  assert.equal(result.discarded.length, 0);

  const [fact] = result.grounded;
  assert.equal(fact.observation, "pain_score");
  assert.equal(fact.value, 7);
  assert.equal(fact.eventId, "e_000001");
  assert.equal(fact.quote, utterance.quote, "the quote comes from the log, verbatim");
  assert.equal(fact.speaker, "patient");
  assert.equal(fact.ts, 5000);
  assert.equal(fact.room, "room-1");
});

test("the quote is taken from the event, never from the candidate", () => {
  const utterance = event("e_000001", { quote: "It is about a seven." });
  const result = ground(
    [candidate({ quote: "about a seven" })],
    [utterance],
  );

  assert.equal(result.grounded.length, 1);
  assert.equal(
    result.grounded[0].quote,
    "It is about a seven.",
    "a candidate cannot supply its own evidence text",
  );
});

test("several candidates on one utterance all survive", () => {
  const utterance = event("e_000001");
  const result = ground(
    [
      candidate({ id: "c1", observation: "pain_score", value: 7 }),
      candidate({ id: "c2", observation: "exertional", value: null }),
    ],
    [utterance],
  );
  assert.equal(result.grounded.length, 2);
  assert.deepEqual(result.grounded.map((f) => f.eventId), ["e_000001", "e_000001"]);
});

// ------------------------------------------------------------ it refuses

test("a candidate with no supporting event is discarded", () => {
  const result = ground([candidate({ sourceEventId: "e_000999" })], [event("e_000001")]);

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded.length, 1);
  assert.equal(result.discarded[0].reason, "event-not-found");
  assert.equal(result.discarded[0].candidate.id, "c1");
});

test("a candidate that names no event at all is discarded", () => {
  const result = ground([candidate({ sourceEventId: undefined })], [event("e_000001")]);

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded[0].reason, "no-supporting-event");
});

test("a candidate supported only by a wrong-role utterance is discarded", () => {
  const clinicianSaidIt = event("e_000001", { speaker: "clinician" });
  const result = ground([candidate({ expectedSpeaker: "patient" })], [clinicianSaidIt]);

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded.length, 1);
  assert.equal(result.discarded[0].reason, "wrong-speaker");
  assert.match(result.discarded[0].detail, /clinician/);
  assert.match(result.discarded[0].detail, /patient/);
});

test("a candidate supported only by a non-speech event is discarded", () => {
  const vital = event("e_000001", {
    source: "vital",
    speaker: "unknown",
    quote: "",
    observation: "spo2",
    value: 91,
  });
  const result = ground([candidate({ expectedSpeaker: "unknown" })], [vital]);

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded[0].reason, "not-speech");
  assert.match(result.discarded[0].detail, /vital/);
});

test("an unresolved speaker cannot support a candidate that expects a role", () => {
  // This is the live case after V1: roles.ts leaves every speaker 'unknown'.
  const unattributed = event("e_000001", { speaker: "unknown" });
  const result = ground([candidate({ expectedSpeaker: "patient" })], [unattributed]);

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded[0].reason, "speaker-unresolved");
});

test("a candidate quoting words the utterance does not contain is discarded", () => {
  const utterance = event("e_000001", { quote: "The pain is about a seven." });
  const result = ground(
    [candidate({ quote: "the pain is unbearable" })],
    [utterance],
  );

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded[0].reason, "quote-not-in-utterance");
});

test("a candidate pointing at an utterance in another room is discarded", () => {
  const elsewhere = event("e_000001", { room: "room-2" });
  const result = ground([candidate({ room: "room-1" })], [elsewhere]);

  assert.equal(result.grounded.length, 0);
  assert.equal(result.discarded[0].reason, "room-mismatch");
});

test("nothing is downgraded — a discarded candidate produces no fact of any kind", () => {
  const result = ground(
    [candidate({ id: "good" }), candidate({ id: "bad", sourceEventId: "e_000999" })],
    [event("e_000001")],
  );

  assert.deepEqual(result.grounded.map((f) => f.candidateId), ["good"]);
  assert.deepEqual(result.discarded.map((d) => d.candidate.id), ["bad"]);
  assert.equal(
    result.grounded.some((f) => f.candidateId === "bad"),
    false,
    "a failed candidate must not appear in the output at all",
  );
});

test("no candidates and no events is an empty result, not a crash", () => {
  const result = ground([], []);
  assert.deepEqual(result.grounded, []);
  assert.deepEqual(result.discarded, []);
});

// ---------------------------------------------------- the refusal channel

test("the discard list carries the candidate, a reason and a readable detail", () => {
  const result = ground([candidate({ sourceEventId: "e_000999" })], []);
  const [discard] = result.discarded;

  assert.equal(discard.candidate.observation, "pain_score");
  assert.equal(discard.reason, "event-not-found");
  assert.ok(discard.detail.length > 0);
  assert.match(discard.detail, /e_000999/);
});

test("every candidate ends up in exactly one channel", () => {
  const events = [event("e_000001"), event("e_000002", { source: "lab", quote: "" })];
  const candidates = [
    candidate({ id: "a" }),
    candidate({ id: "b", sourceEventId: "e_000002", expectedSpeaker: "unknown" }),
    candidate({ id: "c", sourceEventId: "missing" }),
    candidate({ id: "d", expectedSpeaker: "clinician" }),
  ];
  const result = ground(candidates, events);

  assert.equal(result.grounded.length + result.discarded.length, candidates.length);
  const seen = [
    ...result.grounded.map((f) => f.candidateId),
    ...result.discarded.map((d) => d.candidate.id),
  ].sort();
  assert.deepEqual(seen, ["a", "b", "c", "d"]);
});

// ------------------------------------------------------------ it is pure

test("ground is pure — inputs untouched, outputs frozen, deterministic", () => {
  const events = [event("e_000001")];
  const candidates = [candidate()];
  const first = ground(candidates, events);
  const second = ground(candidates, events);

  assert.deepEqual(first, second);
  assert.equal(events[0].speaker, "patient");
  assert.equal(candidates[0].id, "c1");
  assert.throws(() => {
    (first.grounded[0] as { quote: string }).quote = "tampered";
  });
});

test("grounded order follows candidate order", () => {
  const events = [event("e_000001"), event("e_000002")];
  const result = ground(
    [
      candidate({ id: "second", sourceEventId: "e_000002" }),
      candidate({ id: "first", sourceEventId: "e_000001" }),
    ],
    events,
  );
  assert.deepEqual(result.grounded.map((f) => f.candidateId), ["second", "first"]);
});
