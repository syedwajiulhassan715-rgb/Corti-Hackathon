/**
 * The floor, as coordinates.
 *
 * A double-loaded corridor: two wings of rooms facing each other across a
 * central circulation space, with the nurse station standing in the corridor
 * where a real one stands. This is the commonest inpatient ward plan there is,
 * which is the point -- the twin has to read as a building before it can read
 * as data.
 *
 * Pure. No React, no `now`, no network. Give it a list of room numbers and it
 * returns where every wall, door and desk sits in one SVG user-unit space, so
 * the drawing code never computes a coordinate and the layout can be tested
 * without a browser.
 *
 * HONESTY: this geometry is invented. ECHO's log knows which room a patient is
 * in; it does not know the shape of the building. The plan is labelled as
 * simulated on screen for exactly that reason.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface RoomSlot {
  /** Two-digit room number, e.g. "01". */
  readonly room: string;
  readonly wing: "top" | "bottom";
  readonly rect: Rect;
  /** Centre of the door opening, on the corridor-facing wall. */
  readonly door: Point;
}

export interface Plan {
  readonly width: number;
  readonly height: number;
  readonly outer: Rect;
  readonly corridor: Rect;
  readonly station: Rect;
  readonly rooms: readonly RoomSlot[];
  /**
   * The leftover bay when the two wings hold different numbers of rooms. Every
   * room is drawn the SAME width so doors line up across the corridor, which
   * means an odd room count leaves a gap. A ward has a utility bay at the end
   * of a wing; that is what the gap is drawn as, rather than one wing being
   * silently stretched to hide it.
   */
  readonly service: Rect | null;
}

/** Outer wall inset from the viewBox edge, leaving room for the stroke. */
const MARGIN = 16;
const WIDTH = 940;
const WING_H = 172;
const CORRIDOR_H = 104;
/** Width of the door opening cut into the corridor wall. */
export const DOOR_W = 38;
/** How far along a room's corridor wall the door sits (0 = left, 1 = right). */
const DOOR_AT = 0.68;

/** The ward's fixed room list. Ten rooms, mirroring src/projections/ward.ts. */
export const WARD_ROOMS: readonly string[] = Object.freeze([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
]);

/**
 * Merge the rooms the log mentions into the fixed plan.
 *
 * A room ECHO reports but the plan does not know about gets a slot rather than
 * being dropped -- a patient vanishing off the floor because the drawing has
 * no wall for them is the worst possible failure for a board whose whole claim
 * is that it shows everyone.
 */
export function planRooms(occupied: readonly string[]): readonly string[] {
  const all = new Set<string>(WARD_ROOMS);
  for (const room of occupied) all.add(room);
  return [...all].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function buildPlan(rooms: readonly string[]): Plan {
  // Split the list down the middle: first half faces the corridor from above,
  // second half from below, so room order still runs along the corridor.
  const perWing = Math.max(1, Math.ceil(rooms.length / 2));
  const top = rooms.slice(0, perWing);
  const bottom = rooms.slice(perWing);

  const inner = WIDTH - MARGIN * 2;
  const height = MARGIN * 2 + WING_H * 2 + CORRIDOR_H;
  const corridor: Rect = { x: MARGIN, y: MARGIN + WING_H, w: inner, h: CORRIDOR_H };

  const roomW = inner / perWing;

  const slot = (room: string, index: number, wing: "top" | "bottom"): RoomSlot => {
    const w = roomW;
    const x = MARGIN + index * w;
    const y = wing === "top" ? MARGIN : corridor.y + corridor.h;
    const doorY = wing === "top" ? y + WING_H : y;
    return {
      room,
      wing,
      rect: { x, y, w, h: WING_H },
      door: { x: x + w * DOOR_AT, y: doorY },
    };
  };

  return {
    width: WIDTH,
    height,
    outer: { x: MARGIN, y: MARGIN, w: inner, h: height - MARGIN * 2 },
    corridor,
    station: { x: WIDTH / 2 - 118, y: corridor.y + (corridor.h - 60) / 2, w: 236, h: 60 },
    rooms: [
      ...top.map((room, index) => slot(room, index, "top")),
      ...bottom.map((room, index) => slot(room, index, "bottom")),
    ],
    service:
      bottom.length < perWing
        ? {
            x: MARGIN + bottom.length * roomW,
            y: corridor.y + corridor.h,
            w: (perWing - bottom.length) * roomW,
            h: WING_H,
          }
        : null,
  };
}

/**
 * A routed path from a room's door to the nurse station: out into the corridor,
 * then along it. Drawn as a curve rather than an elbow because a straight line
 * across the floor would read as a wall.
 */
export function routeToStation(door: Point, station: Rect, corridor: Rect): string {
  const midY = corridor.y + corridor.h / 2;
  const targetX = door.x < station.x ? station.x : station.x + station.w;
  const targetY = station.y + station.h / 2;
  const liftY = door.y < midY ? midY - 26 : midY + 26;
  return `M${round(door.x)},${round(door.y)} C${round(door.x)},${round(liftY)} ${round((door.x + targetX) / 2)},${round(targetY)} ${round(targetX)},${round(targetY)}`;
}

/**
 * A room's four walls, with the corridor-facing one broken by a doorway.
 * Adjacent rooms share wall coordinates exactly, so the seams close.
 */
export function wallPath(slot: RoomSlot): string {
  const { x, y, w, h } = slot.rect;
  const left = x;
  const right = x + w;
  const doorFrom = slot.door.x - DOOR_W / 2;
  const doorTo = slot.door.x + DOOR_W / 2;
  const doorEdge = slot.door.y;
  const outerEdge = slot.wing === "top" ? y : y + h;
  return [
    `M${round(left)},${round(y)} V${round(y + h)}`,
    `M${round(right)},${round(y)} V${round(y + h)}`,
    `M${round(left)},${round(outerEdge)} H${round(right)}`,
    `M${round(left)},${round(doorEdge)} H${round(doorFrom)}`,
    `M${round(doorTo)},${round(doorEdge)} H${round(right)}`,
  ].join(" ");
}

/** The swing of the door leaf, drawn into the room. */
export function doorSwing(slot: RoomSlot): string {
  const hinge = slot.door.x - DOOR_W / 2;
  const into = slot.wing === "top" ? -DOOR_W : DOOR_W;
  const y = slot.door.y;
  return `M${round(hinge)},${round(y)} L${round(hinge)},${round(y + into)} A${DOOR_W},${DOOR_W} 0 0 ${into < 0 ? 1 : 0} ${round(hinge + DOOR_W)},${round(y)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
