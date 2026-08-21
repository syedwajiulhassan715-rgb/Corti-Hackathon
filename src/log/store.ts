// S0 The event log. Append-only, in memory, mirrored to JSONL.
//
// The log is the sole interface (D5). Everything else in src/ is a fold over
// it, so this file has exactly two jobs: never lose an event, and never let
// one be changed after the fact.
//
// No clock (D8). `ts` is supplied by the caller on every append — live passes
// Date.now() from main.ts or server/index.ts, replay passes the timestamp of
// the last event read. Nothing here reads the wall clock, which is what makes
// replay to T exact.
//
// The Event shape itself lives in contracts/events.ts. This file stores it,
// it does not define it.

import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";

import type { Event, EventId, EventInput, Millis } from "../contracts/index.ts";

export interface EventLogOptions {
  /** JSONL mirror. Omit for a memory-only log. */
  readonly path?: string;
}

const ID_PREFIX = "e_";
const ID_DIGITS = 6;

function formatId(sequence: number): EventId {
  return ID_PREFIX + String(sequence).padStart(ID_DIGITS, "0");
}

function sequenceOf(id: EventId): number {
  const parsed = Number.parseInt(id.slice(ID_PREFIX.length), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Append-only log of Events.
 *
 * Ordering is insertion order and nothing else. A feed event that arrives late
 * keeps the position it was appended at; it is `replay` that filters by ts.
 * Reordering here would make the JSONL mirror disagree with memory.
 */
export class EventLog {
  readonly #events: Event[] = [];
  readonly #byId = new Map<EventId, Event>();
  readonly #path: string | undefined;
  #nextSequence = 1;

  constructor(options: EventLogOptions = {}) {
    this.#path = options.path;
  }

  /**
   * Append one event. Returns the id assigned to it.
   *
   * Ids are a monotonic sequence rather than a hash or a random value: two
   * identical payloads are two distinct events, and a deterministic id keeps a
   * replayed log byte-identical to the one that produced it.
   */
  append(input: EventInput): EventId {
    const event: Event = Object.freeze({
      id: formatId(this.#nextSequence++),
      ts: input.ts,
      patientId: input.patientId,
      room: input.room,
      source: input.source,
      speaker: input.speaker,
      quote: input.quote,
      code: input.code,
      observation: input.observation,
      value: input.value,
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      ...(input.causedByEventIds === undefined
        ? {}
        : { causedByEventIds: Object.freeze([...input.causedByEventIds]) }),
    });

    this.#events.push(event);
    this.#byId.set(event.id, event);
    if (this.#path !== undefined) {
      appendFileSync(this.#path, JSON.stringify(event) + "\n", "utf8");
    }
    return event.id;
  }

  /** Every event, in append order. A fresh array each call. */
  all(): Event[] {
    return this.#events.slice();
  }

  byId(id: EventId): Event | undefined {
    return this.#byId.get(id);
  }

  get size(): number {
    return this.#events.length;
  }

  /** The ts of the last event appended. Undefined on an empty log. */
  get lastTs(): Millis | undefined {
    return this.#events.at(-1)?.ts;
  }

  /**
   * Rehydrate a log from its JSONL mirror, keeping the ids the file already
   * carries and continuing the sequence past the highest one seen. Reissuing
   * an id would break every evidence reference pointing at the old event.
   */
  static load(path: string, options: EventLogOptions = {}): EventLog {
    const log = new EventLog({ path, ...options });
    if (!existsSync(path)) return log;

    let highest = 0;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      const event = Object.freeze(JSON.parse(line) as Event);
      log.#events.push(event);
      log.#byId.set(event.id, event);
      highest = Math.max(highest, sequenceOf(event.id));
    }
    log.#nextSequence = highest + 1;
    return log;
  }

  /**
   * Write the whole in-memory log to a JSONL file. For seeding a fixture or a
   * demo log from a memory-only run — not part of the append path.
   */
  static write(path: string, events: readonly Event[]): void {
    writeFileSync(path, events.map((e) => JSON.stringify(e) + "\n").join(""), "utf8");
  }
}
