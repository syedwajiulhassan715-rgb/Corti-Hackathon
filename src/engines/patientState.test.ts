// Tests for Patient State. Written before the engine.
//
// The load-bearing test is the negative one: a lab value on its own cannot
// raise a level, however alarming it looks. Speech is the only source of
// judgement (D2); feeds corroborate and nothing else.

import { test } from "node:test";
import assert from "node:assert/strict";

import { patientState } from "./patientState.ts";
import { BREATHING_DIFFICULTY, FOUR_HOURS } from "./rules/patient.rules.ts";
import type { Event, Source, Speaker } from "../contracts/index.ts";

const DYSPNOEA = "R06.0";
let seq = 0;

function ev(overrides: Partial<Event> & { ts: number }): Event {
  seq += 1;
  return Object.freeze({
    id: `e_${String(seq).padStart(6, "0")}`,
    room: "room-1",
    source: "speech" as Source,
    speaker: "patient" as Speaker,
    quote: "I cannot catch my breath.",
    code: DYSPNOEA,
    observation: "utterance",
    value: null,
    ...overrides,
  } satisfies Event);
}

/** The patient says it, then someone says it again inside the window. */
function twoMentions(gapMs: number): Event[] {
  return [
    ev({ ts: 1_000_000, speaker: "patient" }),
    ev({ ts: 1_000_000 + gapMs, speaker: "clinician", quote: "Her breathing is worse." }),
  ];
}

// ------------------------------------------------------------------ green

test("no events is green with no evidence", () => {
  const state = patientState([], 2_000_000, { room: "room-1" });
  assert.equal(state.level, "green");
  assert.deepEqual(state.evidence, []);
  assert.equal(state.room, "room-1");
});

test("a single patient mention is not enough — one voice, one time", () => {
  const state = patientState([ev({ ts: 1_000_000 })], 2_000_000, { room: "room-1" });
  assert.equal(state.level, "green");
  assert.deepEqual(state.evidence, []);
});

test("a lab value alone cannot produce yellow", () => {
  // The value is frightening and it still cannot raise the level on its own.
  const labs = [
    ev({ ts: 1_000_000, source: "lab", speaker: "unknown", quote: "", code: null, observation: "pao2", value: 7.1 }),
    ev({ ts: 1_060_000, source: "vital", speaker: "unknown", quote: "", code: null, observation: "resp_rate", value: 32 }),
    ev({ ts: 1_120_000, source: "vital", speaker: "unknown", quote: "", code: null, observation: "spo2", value: 86 }),
  ];
  const state = patientState(labs, 2_000_000, { room: "room-1" });

  assert.equal(state.level, "green", "feeds corroborate, they never conclude (D2)");
  assert.deepEqual(state.evidence, []);
});

test("two feed events carrying the same observation still cannot raise the level", () => {
  const feeds = [
    ev({ ts: 1_000_000, source: "vital", speaker: "unknown", quote: "", code: null, observation: "dyspnoea", value: 1 }),
    ev({ ts: 1_060_000, source: "vital", speaker: "unknown", quote: "", code: null, observation: "dyspnoea", value: 1 }),
  ];
  assert.equal(patientState(feeds, 2_000_000, { room: "room-1" }).level, "green");
});

test("two mentions by the clinician alone do not fire — the patient must report it", () => {
  const events = [
    ev({ ts: 1_000_000, speaker: "clinician" }),
    ev({ ts: 1_060_000, speaker: "clinician" }),
  ];
  assert.equal(patientState(events, 2_000_000, { room: "room-1" }).level, "green");
});

test("an unattributed utterance cannot stand in for the patient", () => {
  // The live case after single-slot diarization: speaker is 'unknown'.
  const events = [
    ev({ ts: 1_000_000, speaker: "unknown" }),
    ev({ ts: 1_060_000, speaker: "unknown" }),
  ];
  assert.equal(patientState(events, 2_000_000, { room: "room-1" }).level, "green");
});

test("an uncoded utterance does not count as a mention of the concept", () => {
  const events = [
    ev({ ts: 1_000_000, code: null }),
    ev({ ts: 1_060_000, code: null, speaker: "clinician" }),
  ];
  assert.equal(patientState(events, 2_000_000, { room: "room-1" }).level, "green");
});

// ----------------------------------------------------------------- yellow

test("patient mention plus a second mention inside four hours is yellow", () => {
  const events = twoMentions(90 * 60 * 1000);
  const state = patientState(events, events[1].ts + 1, { room: "room-1" });

  assert.equal(state.level, "yellow");
  assert.deepEqual(state.evidence, [events[0].id, events[1].id]);
  assert.equal(state.changed_at, events[1].ts, "the level changed when the second mention landed");
});

test("the explanation names both timestamps", () => {
  const events = twoMentions(30 * 60 * 1000);
  const state = patientState(events, events[1].ts + 1, { room: "room-1" });

  assert.match(state.reason_text, new RegExp(String(events[0].ts)));
  assert.match(state.reason_text, new RegExp(String(events[1].ts)));
  assert.match(state.reason_text, /PROVISIONAL/);
});

test("the second mention may come from any speaker", () => {
  for (const speaker of ["clinician", "nurse", "family", "patient"] as const) {
    const events = [
      ev({ ts: 1_000_000, speaker: "patient" }),
      ev({ ts: 1_060_000, speaker }),
    ];
    assert.equal(
      patientState(events, 2_000_000, { room: "room-1" }).level,
      "yellow",
      `a second mention by the ${speaker} should count`,
    );
  }
});

test("exactly four hours apart still counts; a millisecond later does not", () => {
  const inside = twoMentions(FOUR_HOURS);
  assert.equal(patientState(inside, inside[1].ts + 1, { room: "room-1" }).level, "yellow");

  const outside = twoMentions(FOUR_HOURS + 1);
  assert.equal(patientState(outside, outside[1].ts + 1, { room: "room-1" }).level, "green");
});

test("a feed event corroborates a yellow without being able to cause it", () => {
  const events = [
    ...twoMentions(60 * 60 * 1000),
    ev({ ts: 1_070_000, source: "vital", speaker: "unknown", quote: "", code: null, observation: "spo2", value: 87 }),
  ];
  const state = patientState(events, events[1].ts + 1, { room: "room-1" });

  assert.equal(state.level, "yellow");
  assert.ok(state.evidence.includes(events[2].id), "the corroborating vital belongs in the evidence");
  assert.ok(state.evidence.includes(events[0].id), "but the speech events are what raised it");
});

test("yellow always cites at least one speech event (CONTRACTS invariant)", () => {
  const events = [
    ...twoMentions(1000),
    ev({ ts: 1_000_500, source: "vital", speaker: "unknown", quote: "", code: null, observation: "spo2", value: 87 }),
  ];
  const state = patientState(events, 2_000_000, { room: "room-1" });
  assert.equal(state.level, "yellow");

  const cited = events.filter((e) => state.evidence.includes(e.id));
  assert.ok(
    cited.some((e) => e.source === "speech"),
    "a yellow whose evidence is all feed readings would break the invariant",
  );
  assert.equal(cited.length, state.evidence.length, "every cited id resolves to a real event");
});

// ------------------------------------------------- rooms, now, previous

test("events from another room do not raise this room", () => {
  const elsewhere = [
    ev({ ts: 1_000_000, room: "room-2" }),
    ev({ ts: 1_060_000, room: "room-2", speaker: "clinician" }),
  ];
  assert.equal(patientState(elsewhere, 2_000_000, { room: "room-1" }).level, "green");
  assert.equal(patientState(elsewhere, 2_000_000, { room: "room-2" }).level, "yellow");
});

test("events after `now` are not visible to the fold", () => {
  const events = twoMentions(60 * 60 * 1000);
  const before = patientState(events, events[1].ts - 1, { room: "room-1" });
  const after = patientState(events, events[1].ts, { room: "room-1" });

  assert.equal(before.level, "green", "the second mention has not happened yet at this now");
  assert.equal(after.level, "yellow");
});

test("previous_level is carried through and is never omitted", () => {
  const state = patientState(twoMentions(1000), 2_000_000, {
    room: "room-1",
    previousLevel: "green",
  });
  assert.equal(state.previous_level, "green");
  assert.equal(state.level, "yellow");

  const defaulted = patientState([], 1000, { room: "room-1" });
  assert.equal(defaulted.previous_level, "green", "defaults, never undefined");
});

// -------------------------------------------------------------- purity

test("patientState is pure — no clock, deterministic, frozen, inputs untouched", () => {
  const events = twoMentions(1000);
  const first = patientState(events, 2_000_000, { room: "room-1" });
  const second = patientState(events, 2_000_000, { room: "room-1" });

  assert.deepEqual(first, second);
  assert.equal(events.length, 2);
  assert.throws(() => {
    (first as { level: string }).level = "red";
  });
});

test("the rule advertises itself as provisional", () => {
  assert.equal(BREATHING_DIFFICULTY.provisional, true);
  assert.ok(BREATHING_DIFFICULTY.codes.includes(DYSPNOEA));
  assert.equal(BREATHING_DIFFICULTY.windowMs, FOUR_HOURS);
  assert.equal(BREATHING_DIFFICULTY.level, "yellow");
});
