// Tests for the ward projection. Written before ward.ts.
//
// Two properties matter most and both are about isolation:
//   every room gets its own level, computed from its own events only
//   the same log replayed twice produces byte-identical cards
//
// The second is what makes the demo rehearsable. If the ward drifts between
// two replays of the same log, nothing on stage can be trusted.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ward, WARD, INTERACTIVE_ROOMS, BACKGROUND_ROOMS } from "./ward.ts";
import { OBSERVATION, SPEECH } from "../engines/rules/patient.rules.ts";
import type { Event, Source, Speaker } from "../contracts/index.ts";

let seq = 0;
const T = 10_000_000;
const MIN = 60_000;

function base(over: Partial<Event> & { ts: number; room: string }): Event {
  seq += 1;
  return Object.freeze({
    id: `e_${String(seq).padStart(6, "0")}`,
    patientId: "test_patient",
    source: "speech" as Source,
    speaker: "patient" as Speaker,
    quote: "",
    code: null,
    observation: "utterance",
    value: null,
    ...over,
  } satisfies Event);
}

const symptom = (room: string, ts: number, speaker: Speaker = "patient") =>
  base({ room, ts, speaker, source: "speech", observation: SPEECH.symptom, quote: "It is worse today." });

const severe = (room: string, ts: number) =>
  base({ room, ts, source: "speech", speaker: "patient", observation: SPEECH.severeStatement, quote: "I cannot breathe." });

const toks = (room: string, ts: number, value: number) =>
  base({ room, ts, source: "vital", speaker: "unknown", observation: OBSERVATION.toks, value });

// ------------------------------------------------------------- the ward

test("the ward is ten rooms: three interactive, seven background", () => {
  const cards = ward([], T, {});

  assert.equal(cards.length, 10);
  assert.equal(INTERACTIVE_ROOMS.length, 3);
  assert.equal(BACKGROUND_ROOMS.length, 7);
  assert.equal(WARD.length, 10);
  assert.equal(cards.filter((c) => c.kind === "interactive").length, 3);
  assert.equal(cards.filter((c) => c.kind === "background").length, 7);
});

test("every room id is unique and the order is stable", () => {
  const ids = ward([], T, {}).map((c) => c.room);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(ids, ward([], T + 5 * MIN, {}).map((c) => c.room));
});

test("an empty ward is ten green cards, each explaining itself", () => {
  for (const card of ward([], T, {})) {
    assert.equal(card.patient.level, "green");
    assert.deepEqual(card.patient.evidence, []);
    assert.ok(card.patient.reason_text.length > 0, `${card.room} must say why it is green`);
  }
});

// ------------------------------------------------------ room independence

test("each room gets its own independent level", () => {
  const [a, b, c] = INTERACTIVE_ROOMS;
  const events = [
    severe(a, T),                       // red-emergency
    symptom(b, T),                      // yellow
    toks(c, T, 9),                      // red-emergency on the number alone (D10)
    symptom(BACKGROUND_ROOMS[0], T),    // yellow, in a background room
  ];
  const cards = ward(events, T + MIN, {});
  const level = (room: string) => cards.find((x) => x.room === room)!.patient.level;

  assert.equal(level(a), "red-emergency");
  assert.equal(level(b), "yellow");
  assert.equal(level(c), "red-emergency");
  assert.equal(level(BACKGROUND_ROOMS[0]), "yellow");

  for (const quiet of BACKGROUND_ROOMS.slice(1)) {
    assert.equal(level(quiet), "green", `${quiet} has no events and must stay green`);
  }
});

test("one room's evidence never appears on another room's card", () => {
  const [a, b] = INTERACTIVE_ROOMS;
  const loud = severe(a, T);
  const cards = ward([loud], T + MIN, {});

  const cardA = cards.find((c) => c.room === a)!;
  const cardB = cards.find((c) => c.room === b)!;
  assert.deepEqual(cardA.patient.evidence.map((e) => e.id), [loud.id]);
  assert.deepEqual(cardB.patient.evidence, []);
});

test("a room with no events is unaffected by a busy neighbour", () => {
  const [a] = INTERACTIVE_ROOMS;
  const busy = [severe(a, T), toks(a, T + MIN, 9), symptom(a, T + 2 * MIN, "nurse")];
  const quiet = ward(busy, T + 3 * MIN, {}).find((c) => c.room === BACKGROUND_ROOMS[3])!;

  assert.equal(quiet.patient.level, "green");
  assert.deepEqual(quiet.patient.evidence, []);
  assert.equal(quiet.patient.changed_at, 0);
});

// -------------------------------------------------------------- replay

test("replaying the same log twice produces identical cards", () => {
  const events = [
    symptom(INTERACTIVE_ROOMS[0], T),
    toks(INTERACTIVE_ROOMS[0], T + MIN, 5),
    severe(INTERACTIVE_ROOMS[1], T + 2 * MIN),
    toks(BACKGROUND_ROOMS[2], T + 3 * MIN, 2),
  ];

  const first = ward(events, T + 10 * MIN, {});
  const second = ward(events, T + 10 * MIN, {});

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second), "identical down to key order");
});

test("replay to T is unaffected by events after T", () => {
  const room = INTERACTIVE_ROOMS[0];
  const early = [symptom(room, T)];
  const late = [...early, severe(room, T + 10 * MIN)];

  assert.deepEqual(ward(early, T + MIN, {}), ward(late, T + MIN, {}));
});

test("the ward at successive timestamps tells the deterioration story", () => {
  const room = INTERACTIVE_ROOMS[0];
  const events = [symptom(room, T), toks(room, T + MIN, 5), severe(room, T + 2 * MIN)];
  const at = (now: number) => ward(events, now, {}).find((c) => c.room === room)!.patient.level;

  assert.equal(at(T - 1), "green");
  assert.equal(at(T), "yellow");
  assert.equal(at(T + MIN), "red-urgent");
  assert.equal(at(T + 2 * MIN), "red-emergency");
});

// ------------------------------------------------------- the card shape

test("a card carries room, patient state, coordination and previous_level", () => {
  const room = INTERACTIVE_ROOMS[0];
  const s = symptom(room, T);
  const card = ward([s], T + MIN, {}).find((c) => c.room === room)!;

  assert.equal(card.room, room);
  assert.equal(card.kind, "interactive");
  assert.equal(card.patient.level, "yellow");
  assert.ok(card.patient.reason_text.includes("symptom") || card.patient.reason_text.length > 0);
  assert.deepEqual(card.patient.evidence.map((e) => e.id), [s.id]);
  assert.equal(card.previous_level, "green");
  assert.equal(card.patient.previous_level, card.previous_level);
});

test("coordination is an honest placeholder, not a fake green", () => {
  const card = ward([], T, {})[0];

  assert.equal(card.coordination.placeholder, true);
  assert.equal(card.coordination.level, "green");
  assert.deepEqual(card.coordination.blocked_task_ids, []);
  assert.deepEqual(card.coordination.evidence, []);
  assert.match(card.coordination.reason_text, /not implemented|placeholder/i);
  assert.equal(card.coordination.room, card.room);
});

test("previous levels are taken from the caller and default to green", () => {
  const room = INTERACTIVE_ROOMS[0];
  const events = [toks(room, T, 1), toks(room, T + 90 * MIN, 1)];

  const fromGreen = ward(events, T + 91 * MIN, {}).find((c) => c.room === room)!;
  assert.equal(fromGreen.previous_level, "green");

  const fromRed = ward(events, T + 91 * MIN, { previousLevels: { [room]: "red-urgent" } })
    .find((c) => c.room === room)!;
  assert.equal(fromRed.previous_level, "red-urgent");
  assert.notEqual(fromRed.patient.level, "green", "RED never steps straight to GREEN");
});

test("a previous level for one room does not leak into the others", () => {
  const [a, b] = INTERACTIVE_ROOMS;
  const cards = ward([], T, { previousLevels: { [a]: "red-urgent" } });

  assert.equal(cards.find((c) => c.room === a)!.previous_level, "red-urgent");
  assert.equal(cards.find((c) => c.room === b)!.previous_level, "green");
});

// ------------------------------------------------------------- purity

test("ward is pure — inputs untouched, cards frozen, no clock", () => {
  const room = INTERACTIVE_ROOMS[0];
  const events = [symptom(room, T)];
  const cards = ward(events, T + MIN, {});

  assert.equal(events.length, 1);
  assert.equal(events[0].speaker, "patient");
  assert.throws(() => {
    (cards[0] as { room: string }).room = "tampered";
  });
  assert.throws(() => {
    (cards as unknown as RoomCardArray).push(cards[0]);
  });
});

type RoomCardArray = { push: (c: unknown) => number };

test("an event for a room that is not on the ward is ignored", () => {
  const stray = symptom("room-99", T);
  const cards = ward([stray], T + MIN, {});

  assert.equal(cards.length, 10);
  assert.ok(cards.every((c) => c.patient.level === "green"));
  assert.ok(cards.every((c) => c.patient.evidence.length === 0));
});
