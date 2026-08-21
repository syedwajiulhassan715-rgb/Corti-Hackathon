// Tests for speech/number disagreement. Written before contradiction.ts.
//
// The case this exists for: a patient says she feels well while her saturation
// falls and her respiratory rate climbs. That is silent hypoxia, and the
// system must be able to SAY the two disagree rather than quietly siding with
// the numbers and looking like it never heard her.
//
// The one thing it must never do is let the reassurance lower anything.

import { test } from "node:test";
import assert from "node:assert/strict";

import { detectContradiction } from "./contradiction.ts";
import type { Event, EventId, TrendSignal } from "../contracts/index.ts";

let counter = 0;
const T = 10_000_000;

function speech(quote: string, speaker: Event["speaker"], ts = T): Event {
  return Object.freeze({
    id: `e_${String(++counter).padStart(6, "0")}` as EventId,
    ts,
    patientId: "elena_petrova",
    room: "room-02",
    source: "speech",
    speaker,
    quote,
    code: null,
    observation: "utterance",
    value: null,
  } satisfies Event);
}

function signal(observation: string, direction: TrendSignal["direction"], samples = 4): TrendSignal {
  return Object.freeze({
    patientId: "elena_petrova",
    observation,
    baseline: 97,
    current: 91,
    delta: -6,
    direction,
    ratePerHour: -1.5,
    persistenceMs: 3_600_000,
    samples,
    evidenceEventIds: [],
  } as unknown as TrendSignal);
}

test("a patient saying she feels well while two vitals worsen is reported as a disagreement", () => {
  const events = [speech("I feel fine, really.", "patient")];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  const result = detectContradiction(events, signals, T);

  assert.ok(result);
  assert.equal(result.present, true);
  assert.equal(result.reassurance?.quote, "I feel fine, really.");
  assert.deepEqual([...result.worsening].sort(), ["respiratory_rate", "spo2"]);
});

test("the disagreement never lowers anything — it carries no score at all", () => {
  const events = [speech("I feel fine.", "patient")];
  const signals = [signal("spo2", "worsening"), signal("heart_rate", "worsening")];

  const result = detectContradiction(events, signals, T);

  assert.ok(result);
  assert.equal("score" in result, false, "a contradiction is a finding, never an adjustment");
  assert.equal("level" in result, false);
});

test("one worsening vital is not enough to call it a contradiction", () => {
  const events = [speech("I feel fine.", "patient")];
  const signals = [signal("spo2", "worsening"), signal("heart_rate", "stable")];

  assert.equal(detectContradiction(events, signals, T), null);
});

test("reassurance with stable numbers is not a contradiction", () => {
  const events = [speech("I feel well today.", "patient")];
  const signals = [signal("spo2", "stable"), signal("respiratory_rate", "stable")];

  assert.equal(detectContradiction(events, signals, T), null);
});

test("worsening numbers with nobody reassuring is not a contradiction", () => {
  const events = [speech("My chest hurts.", "patient")];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  assert.equal(detectContradiction(events, signals, T), null);
});

test("a clinician saying the patient is fine is a judgement, not reassurance", () => {
  const events = [speech("You're fine, it's just the pneumonia.", "clinician")];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  assert.equal(detectContradiction(events, signals, T), null);
});

test("an unattributed utterance cannot reassure", () => {
  const events = [speech("I feel fine.", "unknown")];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  assert.equal(detectContradiction(events, signals, T), null);
});

test("a negated reassurance is not reassurance", () => {
  const events = [speech("I don't feel fine at all.", "patient")];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  assert.equal(detectContradiction(events, signals, T), null);
});

test("the most recent reassurance is the one quoted", () => {
  const events = [
    speech("I feel fine.", "patient", T),
    speech("My chest hurts a bit.", "patient", T + 1000),
    speech("I feel well now.", "patient", T + 2000),
  ];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  const result = detectContradiction(events, signals, T + 3000);

  assert.equal(result?.reassurance?.quote, "I feel well now.");
});

test("reassurance after `now` is not read", () => {
  const events = [speech("I feel fine.", "patient", T + 60_000)];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  assert.equal(detectContradiction(events, signals, T), null);
});

test("the note names the disagreement in words a nurse would use", () => {
  const events = [speech("I feel fine.", "patient")];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  const result = detectContradiction(events, signals, T);

  assert.match(result!.note, /reports/i);
  assert.match(result!.note, /worsening|falling|disagree/i);
});

test("the finding cites the utterance, so it can be checked", () => {
  const utterance = speech("I feel fine.", "patient");
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];

  const result = detectContradiction([utterance], signals, T);

  assert.deepEqual(result!.evidenceEventIds, [utterance.id]);
});

test("detection is pure and deterministic", () => {
  const events = [speech("I feel fine.", "patient")];
  const signals = [signal("spo2", "worsening"), signal("respiratory_rate", "worsening")];
  const frozen = JSON.stringify(events);

  const a = detectContradiction(events, signals, T);
  const b = detectContradiction(events, signals, T);

  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(events), frozen, "inputs are not mutated");
});

test("no events and no signals is not a crash", () => {
  assert.equal(detectContradiction([], [], T), null);
});
