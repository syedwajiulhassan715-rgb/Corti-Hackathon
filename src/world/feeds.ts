// World: the machines. Simulated bedside monitors for the three live rooms.
//
// FAKED, DELIBERATELY AND VISIBLY (honesty law). There is no bed and no
// monitor. This file replays a written scenario. What is NOT faked is the
// shape: a real integration receives exactly this — a room id, an observation
// name, a number and a timestamp — and everything downstream would not know
// the difference.
//
// DETERMINISTIC, NOT RANDOM. Nothing here rolls dice or reads a clock. The
// scenario is a table of numbers at offsets, and generating it twice produces
// byte-identical events. Random vitals would look livelier on stage and would
// destroy the one property the whole system rests on: replay to T reproduces T
// exactly. A demo that cannot be replayed cannot be trusted, and a jury that
// asks "run that again" would get a different answer.
//
// THE SCORE IS RECEIVED, NOT COMPUTED. Wards already calculate TOKS/NEWS; the
// monitor publishes it. Re-deriving it here would mean writing a scoring
// implementation nobody validated and presenting its output as a measurement.
// So `toks` arrives as a feed value, like it would from the real system.
//
// WHY THE NUMBERS ALONE ARE NOT THE PRODUCT. Room 01 runs a fever. On its own
// that is a fever, and the nurse can see it. It is the note from yesterday —
// ANC 1.6, nearing the neutropenic threshold — that turns it into a one-hour
// antibiotic clock. The feed supplies the number; the chart supplies what it
// means. See projections/history.

import type { EventInput, Millis, PatientId } from "../contracts/index.ts";

/** Observation names the monitor publishes. `toks` is read by patient.rules. */
export const VITAL = Object.freeze({
  toks: "toks",
  spo2: "spo2",
  heartRate: "heart_rate",
  respiratoryRate: "respiratory_rate",
  systolic: "systolic_bp",
  temperature: "temperature",
});

/** One monitor sample. Absent fields are simply not published that minute. */
export interface Sample {
  /** Milliseconds after the scenario start. */
  readonly at: Millis;
  readonly toks: number;
  readonly spo2?: number;
  readonly heartRate?: number;
  readonly respiratoryRate?: number;
  readonly systolic?: number;
  readonly temperature?: number;
}

export interface RoomScenario {
  readonly room: string;
  /** Who is in that bed. Stamped onto every event the arc produces. */
  readonly patientId: PatientId;
  /** Why this arc exists, for the demo script and for review. */
  readonly note: string;
  readonly samples: readonly Sample[];
}

const MIN = 60_000;

/**
 * The three live arcs.
 *
 * Room 03 stays green on purpose. A ward view where every room is red is a
 * ward view nobody reads, and the only way to show the system discriminates is
 * to show it declining to escalate someone.
 */
export const SCENARIO: readonly RoomScenario[] = Object.freeze([
  Object.freeze({
    room: "room-01",
    patientId: "david_kim",
    note:
      "David Kim, on concurrent chemoradiotherapy. Yesterday's bloods: ANC 1.6, nearing the " +
      "neutropenic threshold. A temperature here is not a fever, it is a sepsis clock.",
    samples: Object.freeze([
      Object.freeze({ at: 0 * MIN, toks: 1, temperature: 36.9, heartRate: 78, respiratoryRate: 16, spo2: 97, systolic: 124 }),
      Object.freeze({ at: 3 * MIN, toks: 1, temperature: 37.1, heartRate: 82, respiratoryRate: 16, spo2: 97, systolic: 122 }),
      Object.freeze({ at: 6 * MIN, toks: 2, temperature: 37.6, heartRate: 94, respiratoryRate: 18, spo2: 96, systolic: 118 }),
      Object.freeze({ at: 9 * MIN, toks: 4, temperature: 38.1, heartRate: 108, respiratoryRate: 20, spo2: 95, systolic: 112 }),
      Object.freeze({ at: 12 * MIN, toks: 6, temperature: 38.6, heartRate: 118, respiratoryRate: 22, spo2: 94, systolic: 104 }),
      Object.freeze({ at: 15 * MIN, toks: 6, temperature: 38.8, heartRate: 122, respiratoryRate: 23, spo2: 93, systolic: 100 }),
      Object.freeze({ at: 18 * MIN, toks: 6, temperature: 38.7, heartRate: 120, respiratoryRate: 22, spo2: 94, systolic: 102 }),
    ]),
  }),

  Object.freeze({
    room: "room-02",
    patientId: "elena_petrova",
    note:
      "Elena Petrova, treated pneumonia, atrial fibrillation on the problem list. The monitor " +
      "confirms what she is saying; the conversation is what says it is new. TOKS 7 at minute 1 " +
      "is the value the clinician reads aloud in the recording.",
    samples: Object.freeze([
      Object.freeze({ at: 0 * MIN, toks: 3, spo2: 92, heartRate: 96, respiratoryRate: 22, systolic: 118, temperature: 37.4 }),
      Object.freeze({ at: 1 * MIN, toks: 7, spo2: 88, heartRate: 148, respiratoryRate: 28, systolic: 92, temperature: 37.6 }),
      Object.freeze({ at: 2 * MIN, toks: 9, spo2: 87, heartRate: 180, respiratoryRate: 30, systolic: 80, temperature: 37.8 }),
      Object.freeze({ at: 5 * MIN, toks: 9, spo2: 88, heartRate: 172, respiratoryRate: 29, systolic: 84, temperature: 37.7 }),
      Object.freeze({ at: 10 * MIN, toks: 8, spo2: 90, heartRate: 156, respiratoryRate: 26, systolic: 92, temperature: 37.6 }),
      Object.freeze({ at: 15 * MIN, toks: 7, spo2: 91, heartRate: 140, respiratoryRate: 24, systolic: 98, temperature: 37.5 }),
      Object.freeze({ at: 18 * MIN, toks: 6, spo2: 92, heartRate: 132, respiratoryRate: 23, systolic: 104, temperature: 37.4 }),
    ]),
  }),

  Object.freeze({
    room: "room-03",
    patientId: "aisha_rahman",
    note:
      "Aisha Rahman, breast cancer survivorship, no evidence of disease. Stable throughout. " +
      "She is here so the ward has a room that stays green.",
    samples: Object.freeze([
      Object.freeze({ at: 0 * MIN, toks: 0, temperature: 36.7, heartRate: 68, respiratoryRate: 14, spo2: 99, systolic: 118 }),
      Object.freeze({ at: 6 * MIN, toks: 0, temperature: 36.8, heartRate: 70, respiratoryRate: 14, spo2: 99, systolic: 120 }),
      Object.freeze({ at: 12 * MIN, toks: 1, temperature: 36.9, heartRate: 74, respiratoryRate: 15, spo2: 98, systolic: 116 }),
      Object.freeze({ at: 18 * MIN, toks: 0, temperature: 36.8, heartRate: 71, respiratoryRate: 14, spo2: 99, systolic: 119 }),
    ]),
  }),
]);

function vital(
  room: string,
  patientId: PatientId,
  ts: Millis,
  observation: string,
  value: number,
): EventInput {
  return {
    ts,
    patientId,
    room,
    source: "vital",
    // Feeds have no speaker and no words. CONTRACTS: quote empty for
    // non-speech, code always null for feed sources.
    speaker: "unknown",
    quote: "",
    code: null,
    observation,
    value,
  };
}

/**
 * Every monitor event the scenario produces, in timestamp order.
 *
 * `startedAt` is supplied by the caller — this module reads no clock (D8) —
 * and is the wall-clock moment offset zero corresponds to.
 */
export function monitorEvents(startedAt: Millis): readonly EventInput[] {
  const events: EventInput[] = [];

  for (const arc of SCENARIO) {
    for (const sample of arc.samples) {
      const ts = startedAt + sample.at;
      // TOKS first: it is the one the engine reads, and keeping it ahead of
      // its own components makes the log readable at a glance.
      events.push(vital(arc.room, arc.patientId, ts, VITAL.toks, sample.toks));
      if (sample.spo2 !== undefined) events.push(vital(arc.room, arc.patientId, ts, VITAL.spo2, sample.spo2));
      if (sample.heartRate !== undefined) events.push(vital(arc.room, arc.patientId, ts, VITAL.heartRate, sample.heartRate));
      if (sample.respiratoryRate !== undefined) events.push(vital(arc.room, arc.patientId, ts, VITAL.respiratoryRate, sample.respiratoryRate));
      if (sample.systolic !== undefined) events.push(vital(arc.room, arc.patientId, ts, VITAL.systolic, sample.systolic));
      if (sample.temperature !== undefined) events.push(vital(arc.room, arc.patientId, ts, VITAL.temperature, sample.temperature));
    }
  }

  return Object.freeze(
    events.sort((a, b) => a.ts - b.ts || a.room.localeCompare(b.room)),
  );
}
