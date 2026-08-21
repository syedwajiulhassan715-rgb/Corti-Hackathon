// Event — the only thing that is stored. Everything else is a projection.
//
// Mirrors the Event line in docs/CONTRACTS.md. Frozen once agreed: changing a
// field here changes every engine, projection and surface at once, so change
// the doc first and this file in a commit of its own.

export type Millis = number;
export type EventId = string;

export type Source = "speech" | "vital" | "lab" | "movement" | "order" | "result" | "action";
export type Speaker = "clinician" | "patient" | "nurse" | "family" | "unknown";

/**
 * Who the event is about. The chart directory slug in
 * `fixtures/provided/text/`, e.g. "elena_petrova".
 *
 * Deliberately the slug and not the MRN: it is readable in a JSONL log, it is
 * the key `world/patients` already loads charts by, and it cannot be confused
 * with a real identifier. The MRN lives on the PatientRecord and is what gets
 * sent to Corti as `patient.identifier`.
 */
export type PatientId = string;

export interface Event {
  readonly id: EventId;
  readonly ts: Millis;
  /**
   * THE PRIMARY ENTITY. Every event is about exactly one patient.
   *
   * `room` is where they happened to be; `patientId` is who they happened to.
   * A patient moving bed must not break their history, which is why every
   * projection keyed on a person keys on this and never on the room.
   */
  readonly patientId: PatientId;
  /** Where it happened. Presentation and ward layout only — never identity. */
  readonly room: string;
  readonly source: Source;
  readonly speaker: Speaker;
  /** Empty for non-speech sources. */
  readonly quote: string;
  /** Null if uncoded, and always null for feed sources. Only speech is coded. */
  readonly code: string | null;
  readonly observation: string;
  readonly value: number | string | null;
  /** Optional encounter/run correlation. Present on live-demo events so the
   * causal inspector can trace one encounter without changing projection keys. */
  readonly correlationId?: string;
  /** Direct evidence parents for a derived/system event. Empty/absent for
   * observations that entered independently, such as bedside monitor data. */
  readonly causedByEventIds?: readonly EventId[];
}

/** An event as the caller supplies it. The log assigns the id. */
export type EventInput = Omit<Event, "id">;
