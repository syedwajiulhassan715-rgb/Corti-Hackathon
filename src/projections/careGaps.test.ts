import { test } from "node:test";
import assert from "node:assert/strict";

import { projectPatientCare } from "./careGaps.ts";
import type { Event, PatientHistory, PatientTrends, TrendSignal } from "../contracts/index.ts";

const T = 1_000_000_000;
const HOUR = 3_600_000;

function history(timeline: readonly string[]): PatientHistory {
  return {
    patientId: "p1", asOf: T, name: "Patient One", mrn: "SYNTH-1", summary: "Synthetic",
    room: "room-01", simulated: true, conditions: [], medications: [], facts: [], series: {}, timeline,
  };
}

function overdueSignal(): TrendSignal {
  return {
    patientId: "p1", observation: "spo2", baseline: 98, current: 98, delta: 0,
    direction: "stable", ratePerHour: 0, persistenceMs: 0, sampleCount: 3,
    concerning: false, sinceLastSampleMs: 3 * HOUR, overdue: true,
    evidenceEventIds: ["e_1"],
  };
}

function trends(): PatientTrends {
  return { patientId: "p1", asOf: T + 3 * HOUR, signals: [overdueSignal()], agreementCount: 0, persistenceMs: 0, supportingFactIds: [] };
}

const reading: Event = {
  id: "e_1", ts: T, patientId: "p1", room: "room-01", source: "vital",
  speaker: "unknown", quote: "", code: null, observation: "spo2", value: 98,
};

test("an overdue observation becomes an evidence-backed care gap", () => {
  const care = projectPatientCare([reading], history([reading.id]), trends(), T + 3 * HOUR);
  assert.equal(care.tasks.length, 1);
  assert.equal(care.tasks[0]?.status, "overdue");
  assert.equal(care.gaps[0]?.kind, "overdue-observation");
  assert.deepEqual(care.gaps[0]?.evidenceEventIds, [reading.id]);
});

test("a completed observation action closes the task on replay", () => {
  const action: Event = {
    id: "e_2", ts: T + 3 * HOUR, patientId: "p1", room: "room-01", source: "action",
    speaker: "clinician", quote: "Charge nurse: take the overdue observation", code: null,
    observation: "observe", value: "completed",
  };
  const care = projectPatientCare([reading, action], history([reading.id, action.id]), trends(), T + 3 * HOUR);
  assert.equal(care.tasks[0]?.status, "completed");
  assert.equal(care.tasks[0]?.completedAt, action.ts);
  assert.equal(care.gaps.length, 0);
});

test("a rejected action never silently closes the gap", () => {
  const rejected: Event = {
    id: "e_2", ts: T + 3 * HOUR, patientId: "p1", room: "room-01", source: "action",
    speaker: "clinician", quote: "Charge nurse: rejected", code: null,
    observation: "observe", value: "rejected",
  };
  const care = projectPatientCare([reading, rejected], history([reading.id, rejected.id]), trends(), T + 3 * HOUR);
  assert.equal(care.gaps.length, 1);
});

test("sustained multi-signal deterioration creates a missing reassessment gap", () => {
  const second: Event = { ...reading, id: "e_2", ts: T + HOUR, observation: "heart_rate", value: 110 };
  const signals: TrendSignal[] = [
    { ...overdueSignal(), direction: "worsening", concerning: true, overdue: false, sinceLastSampleMs: 0, persistenceMs: HOUR, evidenceEventIds: [reading.id] },
    { ...overdueSignal(), observation: "heart_rate", direction: "worsening", concerning: true, overdue: false, sinceLastSampleMs: 0, persistenceMs: HOUR, evidenceEventIds: [second.id] },
  ];
  const sustained: PatientTrends = { patientId: "p1", asOf: T + 6 * HOUR, signals, agreementCount: 2, persistenceMs: 3 * HOUR, supportingFactIds: [] };
  const care = projectPatientCare([reading, second], history([reading.id, second.id]), sustained, T + 6 * HOUR);
  assert.equal(care.tasks[0]?.kind, "reassessment");
  assert.equal(care.tasks[0]?.status, "overdue");
  assert.equal(care.gaps[0]?.kind, "missing-reassessment");
  assert.deepEqual(new Set(care.gaps[0]?.evidenceEventIds), new Set([reading.id, second.id]));
});

test("a completed reassessment closes the deterioration gap", () => {
  const second: Event = { ...reading, id: "e_2", ts: T + HOUR, observation: "heart_rate", value: 110 };
  const reassessed: Event = {
    id: "e_3", ts: T + 4 * HOUR, patientId: "p1", room: "room-01", source: "action",
    speaker: "clinician", quote: "Clinical reassessment completed", code: null,
    observation: "reassess", value: "completed",
  };
  const signals: TrendSignal[] = [
    { ...overdueSignal(), direction: "worsening", concerning: true, overdue: false, sinceLastSampleMs: 0, persistenceMs: HOUR, evidenceEventIds: [reading.id] },
    { ...overdueSignal(), observation: "heart_rate", direction: "worsening", concerning: true, overdue: false, sinceLastSampleMs: 0, persistenceMs: HOUR, evidenceEventIds: [second.id] },
  ];
  const sustained: PatientTrends = { patientId: "p1", asOf: reassessed.ts, signals, agreementCount: 2, persistenceMs: HOUR, supportingFactIds: [] };
  const care = projectPatientCare([reading, second, reassessed], history([reading.id, second.id, reassessed.id]), sustained, reassessed.ts);
  assert.equal(care.tasks[0]?.status, "completed");
  assert.equal(care.gaps.length, 0);
});

test("approving a prepared reassessment does not claim the care was completed", () => {
  const second: Event = { ...reading, id: "e_2", ts: T + HOUR, observation: "heart_rate", value: 110 };
  const approved: Event = {
    id: "e_3", ts: T + 4 * HOUR, patientId: "p1", room: "room-01", source: "action",
    speaker: "clinician", quote: "Reassessment request approved", code: null,
    observation: "reassess", value: "approved",
  };
  const signals: TrendSignal[] = [
    { ...overdueSignal(), direction: "worsening", concerning: true, overdue: false, sinceLastSampleMs: 0, persistenceMs: 3 * HOUR, evidenceEventIds: [reading.id] },
    { ...overdueSignal(), observation: "heart_rate", direction: "worsening", concerning: true, overdue: false, sinceLastSampleMs: 0, persistenceMs: 3 * HOUR, evidenceEventIds: [second.id] },
  ];
  const sustained: PatientTrends = { patientId: "p1", asOf: approved.ts, signals, agreementCount: 2, persistenceMs: 3 * HOUR, supportingFactIds: [] };
  const care = projectPatientCare([reading, second, approved], history([reading.id, second.id, approved.id]), sustained, approved.ts);
  assert.equal(care.tasks[0]?.status, "overdue");
  assert.equal(care.gaps[0]?.kind, "missing-reassessment");
});
