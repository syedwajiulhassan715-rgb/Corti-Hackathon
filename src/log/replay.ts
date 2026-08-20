// S0 Replay. The exact event slice up to a timestamp.
//
// "Replay to T reproduces state at T exactly" (CONTRACTS.md) rests entirely on
// this function being deterministic: same log, same T, same slice, forever.
//
// No clock (D8). `until` is an argument. Live callers pass Date.now() from
// main.ts or server/index.ts; replay callers pass the timestamp of the last
// event read. Nothing in here decides for itself what time it is.

import type { EventLog } from "./store.ts";
import type { Event, Millis } from "../contracts/index.ts";

/**
 * Every event with `ts <= until`, in append order.
 *
 * Inclusive at `until` — an event stamped exactly T happened at T and belongs
 * in the state at T. Exclusive of everything after, down to the millisecond.
 *
 * The filter is on ts, not on position, so a feed event that was appended late
 * still lands in the slice its timestamp belongs to. Among events sharing a
 * timestamp, append order is preserved: it is the only tie-break that survives
 * a reload from the JSONL mirror.
 */
export function replay(log: EventLog, until: Millis): readonly Event[] {
  const slice: Event[] = [];
  for (const event of log.all()) {
    if (event.ts <= until) slice.push(event);
  }
  return slice;
}

/**
 * The events in `(after, until]`. For advancing a projection that has already
 * folded up to `after`, without refolding from the start.
 */
export function replayBetween(
  log: EventLog,
  after: Millis,
  until: Millis,
): readonly Event[] {
  const slice: Event[] = [];
  for (const event of log.all()) {
    if (event.ts > after && event.ts <= until) slice.push(event);
  }
  return slice;
}

/**
 * The timestamp a replayed fold should treat as `now`: the ts of the last
 * event in the slice (D8 — replay passes the timestamp of the last event
 * read). Undefined when the slice is empty, which callers must handle rather
 * than substituting a clock reading.
 */
export function nowAt(slice: readonly Event[]): Millis | undefined {
  return slice.at(-1)?.ts;
}
