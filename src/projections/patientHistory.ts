// Patient history — the trend engine's input.
//
// Pure function of its arguments. No clock, no network, no disk (D8) — the
// chart arrives as an argument, loaded by world/patients, same as
// projections/history.
//
// KEYED ON PATIENTID, NEVER ROOM (SPEC.md v2: "Event Log (patientId is the
// primary key)"). A patient moving bed must not lose their history, so every
// filter below is `e.patientId === patientId`, never `e.room === room`. Room
// is read only to answer "where are they now", from the latest event, which
// is presentation and never identity (CONTRACTS: room on Event).
//
// TWO OUTPUTS DOWNSTREAM DEPENDS ON
//
//   series   numeric feed samples, grouped by observation, ts-ascending. The
//            trend engine folds these into baseline/current/delta/direction;
//            garbage order here is a garbage trend there.
//   facts    derived speech facts — the same rows projections/history calls
//            `extracted`, but classified into Corti's own FactGroup taxonomy
//            (clinical.ts) instead of left as raw observation strings, so
//            this projection's output and a real Corti facts response are
//            the same shape.
//
// Every fact cites the one utterance-derived event it came from. A fact that
// cannot name that event does not get built — see ClinicalFact.evidenceEventIds.

import { roomForPatient, type PatientRecord } from "../world/patients.ts";
import type {
  ClinicalFact,
  Event,
  FactGroup,
  Millis,
  PatientHistory,
  SeriesPoint,
} from "../contracts/index.ts";

const UTTERANCE = "utterance";

/**
 * Derived speech observations (pipeline/observations.ts SYMPTOM,
 * HCP_CONCERN, SEVERE_STATEMENT, EMERGENCY_REQUEST) mapped onto Corti's own
 * fact taxonomy, so a fact ECHO derives from the transcript and a fact Corti
 * returns from `/v2/interactions/{id}/facts/` round-trip without a
 * translation layer downstream.
 *
 * Duplicated as literals rather than imported from pipeline/observations,
 * the same call that file itself makes against engines/rules: projections/
 * stays independent of pipeline/, and the two are folds over the same log,
 * not a chain that calls into each other.
 *
 *   symptom            what the patient reported having — history of the
 *                       present illness, Corti's own bucket for that.
 *   severe_statement    the same kind of self-report, flagged for how it was
 *                       said rather than what code it carries. Still HPI.
 *   hcp_concern         the clinician's read of the situation, not a symptom
 *                       — that is an assessment.
 *   emergency_request    calling the crash team is a thing that was DONE, not
 *                       observed — that is an action.
 *
 * An observation this table has never heard of still gets a group ("other")
 * rather than being dropped: the fact still carries its evidence and its
 * quote, and a wrong bucket is a smaller failure than a missing card.
 */
const FACT_GROUP_BY_OBSERVATION: Readonly<Record<string, FactGroup>> = Object.freeze({
  symptom: "history-of-present-illness",
  severe_statement: "history-of-present-illness",
  hcp_concern: "assessment",
  emergency_request: "actions",
});

function factGroupFor(observation: string): FactGroup {
  return FACT_GROUP_BY_OBSERVATION[observation] ?? "other";
}

function toFact(event: Event): ClinicalFact {
  return Object.freeze({
    id: `f_${event.id}`,
    patientId: event.patientId,
    observedAt: event.ts,
    group: factGroupFor(event.observation),
    name: event.observation.replace(/_/g, " "),
    ...(event.value === null ? {} : { value: event.value }),
    speaker: event.speaker,
    quote: event.quote,
    code: event.code,
    // The one utterance this fact was folded from. Never empty — a fact
    // that could not name its evidence would not reach this function, since
    // it is built from exactly one event.
    evidenceEventIds: Object.freeze([event.id]),
    source: event.observation === "corti_fact" ? "corti" as const : "derived" as const,
  });
}

/**
 * Fold the log for ONE patient against their chart, as at `now`.
 *
 * `now` is an argument and never a clock reading (D8), so replaying to an
 * earlier T reproduces the history exactly as it stood then — the same fold,
 * asked about a different moment.
 */
export function patientHistory(
  events: readonly Event[],
  record: PatientRecord | undefined,
  now: Millis,
): PatientHistory | undefined {
  if (record === undefined) return undefined;

  const patientId = record.slug;

  // Stable sort: Array.prototype.sort preserves relative order of equal
  // keys, so events sharing a ts keep the append order the log gave them —
  // the same tie-break log/replay.ts documents.
  const visible = events
    .filter((e) => e.patientId === patientId && e.ts <= now)
    .slice()
    .sort((a, b) => a.ts - b.ts);

  const series: Record<string, SeriesPoint[]> = {};
  for (const event of visible) {
    if (event.source === "speech") continue;
    if (typeof event.value !== "number") continue;
    const point: SeriesPoint = Object.freeze({
      ts: event.ts,
      value: event.value,
      eventId: event.id,
    });
    (series[event.observation] ??= []).push(point);
  }
  const frozenSeries: Record<string, readonly SeriesPoint[]> = {};
  for (const [observation, points] of Object.entries(series)) {
    frozenSeries[observation] = Object.freeze(points);
  }

  const facts = visible
    .filter((e) => e.source === "speech" && e.observation !== UTTERANCE)
    .map(toFact);

  // Room is "where are they now", read off the latest event rather than the
  // hardcoded room->patient map, so a patient who moves bed mid-log still
  // shows their current bed. Falls back to the hardcoded assignment only
  // when the patient has no events yet.
  const room = visible.at(-1)?.room ?? roomForPatient(patientId) ?? null;

  return Object.freeze({
    patientId,
    asOf: now,
    name: record.name,
    mrn: record.mrn,
    summary: record.summary,
    room,
    simulated: record.simulated,
    conditions: Object.freeze(record.conditions.map((c) => Object.freeze({ ...c }))),
    medications: Object.freeze(
      record.medications.map((m) =>
        Object.freeze({ name: m.name, dose: m.dose, frequency: m.frequency }),
      ),
    ),
    facts: Object.freeze(facts),
    series: Object.freeze(frozenSeries),
    timeline: Object.freeze(visible.map((e) => e.id)),
  });
}
