// Tests for the trend engine's input: series, facts and timeline, folded per
// patient rather than per room.
//
// The chart is a literal here rather than loaded from disk, same reason as
// history.test.ts: this projection must be pure and must not care where the
// record came from.

import { test } from "node:test";
import assert from "node:assert/strict";

import { patientHistory } from "./patientHistory.ts";
import type { PatientRecord } from "../world/patients.ts";
import type { Event, EventId } from "../contracts/index.ts";

let counter = 0;

function vital(
  patientId: string,
  room: string,
  ts: number,
  observation: string,
  value: number,
): Event {
  return Object.freeze({
    id: `e_${String(++counter).padStart(6, "0")}` as EventId,
    ts,
    patientId,
    room,
    source: "vital",
    speaker: "unknown",
    quote: "",
    code: null,
    observation,
    value,
  } satisfies Event);
}

function speech(
  patientId: string,
  room: string,
  ts: number,
  quote: string,
  speaker: string,
  code: string | null,
  observation = "utterance",
): Event {
  return Object.freeze({
    id: `e_${String(++counter).padStart(6, "0")}` as EventId,
    ts,
    patientId,
    room,
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
  ]),
  medications: Object.freeze([
    Object.freeze({ name: "Apixaban", dose: "5mg", frequency: "BID", purpose: "Anticoagulation" }),
  ]),
  encounters: Object.freeze([]),
  simulated: true as const,
});

test("series groups numeric feed events by observation, ts-ascending", () => {
  const events = [
    vital("test_patient", "room-02", 3000, "spo2", 91),
    vital("test_patient", "room-02", 1000, "spo2", 97),
    vital("test_patient", "room-02", 2000, "heart_rate", 100),
  ];
  const view = patientHistory(events, CHART, 10_000)!;

  assert.deepEqual(
    view.series["spo2"]!.map((p) => p.value),
    [97, 91],
    "ts-ascending regardless of input order",
  );
  assert.equal(view.series["heart_rate"]!.length, 1);
});

test("patientId isolation: another patient's events never leak in", () => {
  const events = [
    vital("test_patient", "room-02", 1000, "spo2", 97),
    vital("other_patient", "room-01", 1000, "spo2", 60),
    speech("other_patient", "room-01", 1000, "chest pain", "patient", "R07.89"),
  ];
  const view = patientHistory(events, CHART, 10_000)!;

  assert.equal(view.series["spo2"]!.length, 1);
  assert.equal(view.series["spo2"]![0]!.value, 97);
  assert.equal(view.facts.length, 0);
  assert.equal(view.timeline.length, 1);
});

test("a patient keeps their history across a room move — keyed on patientId, not room", () => {
  const events = [
    vital("test_patient", "room-01", 1000, "spo2", 97),
    vital("test_patient", "room-02", 2000, "spo2", 95),
  ];
  const view = patientHistory(events, CHART, 10_000)!;

  assert.equal(view.series["spo2"]!.length, 2, "both readings belong to the patient, not the room");
  assert.equal(view.room, "room-02", "room reflects the latest event, not a hardcoded map");
});

test("now cutoff: nothing after `now` is visible", () => {
  const early = vital("test_patient", "room-02", 1000, "spo2", 97);
  const late = vital("test_patient", "room-02", 5000, "spo2", 80);
  const view = patientHistory([early, late], CHART, 1000)!;

  assert.equal(view.series["spo2"]!.length, 1);
  assert.equal(view.series["spo2"]![0]!.value, 97);
  assert.equal(view.timeline.length, 1);
});

test("purity: inputs are untouched and the same inputs fold to the same output", () => {
  const events = Object.freeze([
    vital("test_patient", "room-02", 2000, "spo2", 91),
    vital("test_patient", "room-02", 1000, "spo2", 97),
  ]);
  const before = JSON.stringify(events);

  const a = patientHistory(events, CHART, 10_000)!;
  const b = patientHistory(events, CHART, 10_000)!;

  assert.equal(JSON.stringify(events), before, "input array untouched");
  assert.deepEqual(a, b, "same inputs, same output — no clock, no hidden state");
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.series));
  assert.ok(Object.isFrozen(a.timeline));
});

test("every fact carries at least one evidence event id", () => {
  const events = [
    speech("test_patient", "room-02", 1000, "I cannot catch my breath", "patient", "R06.02"),
    speech(
      "test_patient",
      "room-02",
      1000,
      "I cannot catch my breath",
      "patient",
      "R06.02",
      "severe_statement",
    ),
  ];
  const view = patientHistory(events, CHART, 10_000)!;

  assert.equal(view.facts.length, 1, "the raw utterance is not itself a fact");
  const fact = view.facts[0]!;
  assert.ok(fact.evidenceEventIds.length >= 1);
  assert.equal(fact.group, "history-of-present-illness");
  assert.equal(fact.source, "derived");
});

test("derived facts map onto Corti's fact taxonomy by observation", () => {
  const events = [
    speech("test_patient", "room-02", 1000, "I am worried", "clinician", null, "hcp_concern"),
    speech("test_patient", "room-02", 2000, "calling the acute team", "clinician", null, "emergency_request"),
  ];
  const view = patientHistory(events, CHART, 10_000)!;

  const concern = view.facts.find((f) => f.name === "hcp concern")!;
  const action = view.facts.find((f) => f.name === "emergency request")!;
  assert.equal(concern.group, "assessment");
  assert.equal(action.group, "actions");
});

test("timeline is every event id for this patient, in ts order", () => {
  const events = [
    vital("test_patient", "room-02", 3000, "spo2", 91),
    speech("test_patient", "room-02", 1000, "hello", "clinician", null),
    vital("test_patient", "room-02", 2000, "heart_rate", 100),
  ];
  const view = patientHistory(events, CHART, 10_000)!;

  assert.deepEqual(view.timeline, [events[1]!.id, events[2]!.id, events[0]!.id]);
});

test("unknown patient returns undefined rather than throwing", () => {
  assert.equal(patientHistory([], undefined, 10_000), undefined);
});

test("chart fields are carried through: conditions, medications, mrn, summary", () => {
  const view = patientHistory([], CHART, 10_000)!;

  assert.equal(view.mrn, "0001");
  assert.equal(view.summary, "80 years, Female");
  assert.equal(view.conditions.length, 1);
  assert.equal(view.conditions[0]!.code, "J18.9");
  assert.equal(view.medications.length, 1);
  assert.equal(view.medications[0]!.name, "Apixaban");
  assert.equal(view.simulated, true);
});
