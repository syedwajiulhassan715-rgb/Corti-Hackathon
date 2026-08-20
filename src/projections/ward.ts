// S6 Ward projection. Ten room cards, folded from the log.
//
// Pure function of the event log. No network, no stored state.
// Takes `now` as an explicit argument (D8). Never calls Date.now().
// Live passes Date.now(); replay passes the timestamp of the last event read.
//
// CLINICAL §1: the ward is ten rooms. Three are interactive and change during
// the demo — one improving, one deteriorating, one clinically stable but
// delayed by an incomplete coordination task. Seven provide realistic
// background activity and stay put unless the test data moves them.
//
// Every card is computed from its own room's events and nothing else. That
// isolation is the point: ten independent readings, not one ward-level mood.
// It is also what makes the three interactive rooms legible on stage — a
// change in one card cannot have come from somewhere else.

import type { Event, EventId, Millis } from "../contracts/index.ts";
import { patientState, type PatientState } from "../engines/patientState.ts";
import type { Level } from "../engines/rules/patient.rules.ts";

export type RoomKind = "interactive" | "background";

/**
 * Coordination State is not built yet. This is a placeholder that says so.
 *
 * It is deliberately not a plain green: a card that reports green for a signal
 * nobody has implemented is a card that lies quietly. `placeholder: true` lets
 * the surface render it as pending rather than as healthy.
 *
 * Shape matches CoordinationState in docs/CONTRACTS.md so that engines/
 * coordination can drop in without the card changing.
 */
export interface CoordinationPlaceholder {
  readonly room: string;
  readonly level: Level;
  readonly reason_text: string;
  readonly blocked_task_ids: readonly string[];
  readonly evidence: readonly EventId[];
  readonly changed_at: Millis;
  readonly placeholder: true;
}

export interface RoomCard {
  readonly room: string;
  readonly kind: RoomKind;
  readonly patient: PatientState;
  readonly coordination: CoordinationPlaceholder;
  /**
   * The patient level before this fold, hoisted onto the card because web/
   * animates the change and should not have to reach into patient state for
   * it. Always equal to patient.previous_level.
   */
  readonly previous_level: Level;
}

export interface WardOptions {
  /**
   * Previous patient level per room, from the last projection. Absent rooms
   * default to green.
   *
   * Passed in rather than derived because de-escalation depends on where the
   * room was: RED never steps straight to GREEN, and a fold that could not see
   * the previous level would silently skip that rule. Live passes the last
   * frame; replay folds forward from green.
   */
  readonly previousLevels?: Readonly<Record<string, Level>>;
}

export interface RoomDefinition {
  readonly room: string;
  readonly kind: RoomKind;
  /** What this room is for in the demo. CLINICAL §1. */
  readonly role: string;
}

/** CLINICAL §1: three interactive rooms, one per arc. */
export const INTERACTIVE_ROOMS: readonly string[] = Object.freeze([
  "room-01",
  "room-02",
  "room-03",
]);

/** CLINICAL §1: seven rooms of realistic background activity. */
export const BACKGROUND_ROOMS: readonly string[] = Object.freeze([
  "room-04",
  "room-05",
  "room-06",
  "room-07",
  "room-08",
  "room-09",
  "room-10",
]);

export const WARD: readonly RoomDefinition[] = Object.freeze([
  Object.freeze({ room: "room-01", kind: "interactive" as RoomKind, role: "deteriorating" }),
  Object.freeze({ room: "room-02", kind: "interactive" as RoomKind, role: "improving" }),
  Object.freeze({ room: "room-03", kind: "interactive" as RoomKind, role: "stable, stalled coordination task" }),
  ...BACKGROUND_ROOMS.map((room) =>
    Object.freeze({ room, kind: "background" as RoomKind, role: "background activity" }),
  ),
]);

const COORDINATION_PENDING =
  "Coordination State is not implemented yet — this is a placeholder, not a green light.";

function coordinationPlaceholder(room: string): CoordinationPlaceholder {
  return Object.freeze({
    room,
    level: "green" as Level,
    reason_text: COORDINATION_PENDING,
    blocked_task_ids: Object.freeze([]),
    evidence: Object.freeze([]),
    changed_at: 0,
    placeholder: true as const,
  });
}

/**
 * The ward at `now`: one card per room, in WARD order.
 *
 * Events belonging to rooms that are not on the ward are ignored rather than
 * creating an eleventh card. The ward is a fixed layout, not a set derived
 * from whatever the log happens to mention.
 */
export function ward(
  events: readonly Event[],
  now: Millis,
  options: WardOptions = {},
): readonly RoomCard[] {
  const previousLevels = options.previousLevels ?? {};

  // Bucket once. Ten passes over the whole log would be the same answer more
  // slowly, and the buckets make the per-room isolation obvious.
  const byRoom = new Map<string, Event[]>();
  for (const definition of WARD) byRoom.set(definition.room, []);
  for (const event of events) byRoom.get(event.room)?.push(event);

  const cards = WARD.map((definition) => {
    const patient = patientState(byRoom.get(definition.room) ?? [], now, {
      room: definition.room,
      previousLevel: previousLevels[definition.room] ?? "green",
    });

    return Object.freeze({
      room: definition.room,
      kind: definition.kind,
      patient,
      coordination: coordinationPlaceholder(definition.room),
      previous_level: patient.previous_level,
    });
  });

  return Object.freeze(cards);
}

/** The levels to hand back as `previousLevels` on the next fold. */
export function levelsOf(cards: readonly RoomCard[]): Readonly<Record<string, Level>> {
  const levels: Record<string, Level> = {};
  for (const card of cards) levels[card.room] = card.patient.level;
  return Object.freeze(levels);
}
