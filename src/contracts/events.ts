// Event — the only thing that is stored. Everything else is a projection.
//
// Mirrors the Event line in docs/CONTRACTS.md. Frozen once agreed: changing a
// field here changes every engine, projection and surface at once, so change
// the doc first and this file in a commit of its own.

export type Millis = number;
export type EventId = string;

export type Source = "speech" | "vital" | "lab" | "movement" | "order" | "result" | "action";
export type Speaker = "clinician" | "patient" | "nurse" | "family" | "unknown";

export interface Event {
  readonly id: EventId;
  readonly ts: Millis;
  readonly room: string;
  readonly source: Source;
  readonly speaker: Speaker;
  /** Empty for non-speech sources. */
  readonly quote: string;
  /** Null if uncoded, and always null for feed sources. Only speech is coded. */
  readonly code: string | null;
  readonly observation: string;
  readonly value: number | string | null;
}

/** An event as the caller supplies it. The log assigns the id. */
export type EventInput = Omit<Event, "id">;
