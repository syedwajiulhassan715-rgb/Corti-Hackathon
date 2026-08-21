// S2 Incremental role attribution for the ambient live path.
//
// Pure function of its arguments. No clock, no network, no stored state (D8).
//
// roles.ts decides once, over a finished recording. Ambient capture does not
// get that luxury: diarization slots arrive one segment at a time, and the
// first two segments of a real ward conversation are routinely not enough to
// tell a nurse from a patient. So attribution is a FOLD, recomputed over every
// segment received so far, exactly like the ward queue is recomputed over
// every event received so far.
//
// Recomputing means an attribution can change mid-encounter. That is correct —
// more evidence should be allowed to overturn a weaker reading — but it must
// never happen quietly, because a transcript that silently relabels who said
// what is worse than one that never labelled anything. So this reports
// `changed` and `newlyResolved` and leaves the announcing to the caller.
//
// Nothing here mutates: assignRoles returns relabelled copies, and event ids,
// timestamps and quotes are never touched. Replaying the same segments in the
// same order reproduces the same attribution.

import { assignRoles, type RoleAssignment } from "./roles.ts";
import type { Event, EventId } from "../contracts/index.ts";

export interface LiveAttribution {
  /** Every event, speech relabelled where a role was decided. */
  readonly events: readonly Event[];
  /** The full assignment, including per-slot evidence and the spoken note. */
  readonly assignment: RoleAssignment;
  /** The attribution differs from `previous`. Worth telling the surface. */
  readonly changed: boolean;
  /** Unresolved before, resolved now. The moment roles first appear. */
  readonly newlyResolved: boolean;
}

/**
 * Attribute the run so far.
 *
 * `slots` maps event id to the diarization speakerId Corti supplied. Events
 * absent from the map — every non-speech event — pass through untouched.
 *
 * `previous` is the assignment from the last call, or null on the first. It is
 * read only to decide whether anything changed; it never influences the
 * decision itself, so attribution stays a pure function of the evidence.
 */
export function attributeLive(
  events: readonly Event[],
  slots: ReadonlyMap<EventId, number>,
  previous: RoleAssignment | null,
): LiveAttribution {
  const assignment = assignRoles(events, slots);

  return Object.freeze({
    events: assignment.events,
    assignment,
    changed: differs(previous, assignment),
    newlyResolved: previous?.resolved !== true && assignment.resolved,
  });
}

/**
 * Whether two assignments say something different. Compared on what a reader
 * would notice — resolved, method, and each slot's role — not on the counts,
 * which tick up on every segment and would report a change every time.
 */
function differs(previous: RoleAssignment | null, next: RoleAssignment): boolean {
  if (previous === null) return next.resolved;
  if (previous.resolved !== next.resolved) return true;
  if (previous.method !== next.method) return true;

  const before = new Map(previous.slots.map((slot) => [slot.slot, slot.role]));
  if (before.size !== next.slots.length) return true;

  return next.slots.some((slot) => before.get(slot.slot) !== slot.role);
}
