// Tests for holding a conversation against a chart.
//
// The chart is a literal here rather than loaded from disk, because this
// projection must be pure and must not care where the record came from.

import { test } from "node:test";
import assert from "node:assert/strict";

import { history } from "./history.ts";
import type { PatientRecord } from "../world/patients.ts";
import type { Event, EventId } from "../contracts/index.ts";

let counter = 0;

function speech(quote: string, speaker: string, code: string | null, observation = "utterance"): Event {
  return Object.freeze({
    id: `e_${String(++counter).padStart(6, "0")}` as EventId,
    ts: counter * 1000,
    room: "room-02",
    source: "speech",
    speaker: speaker as Event["speaker"],
    quote,
    code,
    observation,
    value: null,
  } satisfies Event);
}

const CHART: PatientRecord = Object.freeze({
  slug: "test_patient",
  name: "Test Patient",
  mrn: "0001",
  summary: "80 years, Female",
  conditions: Object.freeze([
    Object.freeze({ code: "J18.9", label: "Community-acquired pneumonia", status: "Active" }),
    Object.freeze({ code: "I48.0", label: "Atrial fibrillation", status: "Active" }),
  ]),
  medications: Object.freeze([]),
  encounters: Object.freeze([]),
  simulated: true as const,
});

test("a coded finding already on the problem list is known, not news", () => {
  const events = [speech("you have pneumonia", "clinician", "J18.9")];
  const view = history(events, CHART, "room-02", 10_000)!;

  assert.equal(view.known.length, 1);
  assert.equal(view.known[0]!.code, "J18.9");
  assert.equal(view.known[0]!.matchesCondition, "Community-acquired pneumonia");
  assert.equal(view.fresh.length, 0);
});

test("a coded finding absent from the problem list is what the conversation added", () => {
  const events = [speech("I have a sharp pain in my chest", "patient", "R07.89")];
  const view = history(events, CHART, "room-02", 10_000)!;

  assert.equal(view.fresh.length, 1);
  assert.equal(view.fresh[0]!.code, "R07.89");
  assert.equal(view.fresh[0]!.quote, "I have a sharp pain in my chest", "quoted from the log");
  assert.equal(view.known.length, 0);
});

test("a prior condition plus something said today raises a question with its evidence", () => {
  const events = [
    speech("I have a sharp pain in my chest", "patient", "R07.89"),
    speech("could this be a blood clot", "patient", null),
  ];
  const view = history(events, CHART, "room-02", 10_000)!;

  const af = view.flags.find((f) => f.condition === "I48.0")!;
  assert.ok(af !== undefined, "atrial fibrillation should raise a flag");
  assert.equal(af.evidence.length, 2, "both utterances are cited");
  assert.ok(af.matched.includes("R07.89"));
  assert.ok(af.matched.includes("blood clot"));
  assert.ok(af.question.includes("?"), "flags ask, they do not conclude");
});

test("a condition not on this chart raises nothing, however suggestive the words", () => {
  const chart: PatientRecord = Object.freeze({ ...CHART, conditions: Object.freeze([]) });
  const events = [speech("could this be a blood clot", "patient", "R07.89")];
  const view = history(events, chart, "room-02", 10_000)!;

  assert.equal(view.flags.length, 0);
});

test("extracted facts are reported separately from raw utterances", () => {
  const events = [
    speech("I cannot catch my breath", "patient", "R06.02"),
    speech("I cannot catch my breath", "patient", "R06.02", "severe_statement"),
  ];
  const view = history(events, CHART, "room-02", 10_000)!;

  assert.equal(view.extracted.length, 1);
  assert.equal(view.extracted[0]!.observation, "severe_statement");
  assert.equal(view.fresh.length, 1, "the raw utterance is the coded finding");
});

test("nothing after `now` is visible — the same fold, asked about an earlier moment", () => {
  const early = speech("you have pneumonia", "clinician", "J18.9");
  const late = speech("I have a sharp pain in my chest", "patient", "R07.89");
  const view = history([early, late], CHART, "room-02", early.ts)!;

  assert.equal(view.known.length, 1);
  assert.equal(view.fresh.length, 0, "the later utterance has not happened yet");
});

test("another room's events do not leak into this chart", () => {
  const other: Event = Object.freeze({ ...speech("chest pain", "patient", "R07.89"), room: "room-03" });
  const view = history([other], CHART, "room-02", 10_000)!;

  assert.equal(view.fresh.length, 0);
  assert.equal(view.known.length, 0);
});

test("no chart means no view, rather than a crash or an empty guess", () => {
  assert.equal(history([], undefined, "room-02", 10_000), undefined);
});

test("history is pure — deterministic and frozen", () => {
  const events = [speech("could this be a blood clot", "patient", "R07.89")];
  const a = history(events, CHART, "room-02", 10_000)!;
  const b = history(events, CHART, "room-02", 10_000)!;

  assert.ok(Object.isFrozen(a));
  assert.deepEqual(a, b);
});
