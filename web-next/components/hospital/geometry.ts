/*
  The building, as numbers.

  Everything the hospital twin draws is derived from one projection and one
  table of footprints, so the model can be re-proportioned without touching a
  single path in the component. This file is pure: no React, no time, no DOM.

  THE PROJECTION. A shallow axonometric -- x runs down-right, z runs down-left,
  floors stack straight up. KY is deliberately small (0.22, about 14 degrees)
  so the plates read as an architectural section rather than as an isometric
  game tile, and so four floors fit a landscape frame without the drawing
  becoming a tower.

  WHY THE FLOORS OVERLAP. FLOOR_GAP (150) is smaller than a plate's screen
  height (about 202), so each floor hides the rear strip of the floor below.
  That is the correct read for a stacked-floorplate model: you see the front of
  every level and the whole of the top one. Labels therefore anchor at 0.62 of
  a zone's depth -- toward the viewer -- never at the true centroid, which for
  the deepest zones would land in the hidden band.
*/

/** Footprint extent, in plan units. The whole model scales off these two. */
export const FOOTPRINT_W = 760;
export const FOOTPRINT_D = 160;

const KX = 0.86;
const KY = 0.22;

export const ORIGIN_X = 180;
export const ORIGIN_Y = 60;
/** Vertical distance between floor plates, in screen units. */
export const FLOOR_GAP = 150;
/** Visible thickness of a floor slab. The floor label is set into this edge. */
export const SLAB = 14;
/** The top floor. Level numbers count up the way a lift button does. */
export const TOP_LEVEL = 4;
/** Screen angle of the x axis, in degrees. Iso text sits on this baseline. */
export const ISO_ANGLE = (Math.atan2(KY, KX) * 180) / Math.PI;

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** A footprint rectangle in plan coordinates. z runs front-to-back. */
export interface Rect3 {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

export function project(x: number, z: number, level: number): Pt {
  return {
    x: ORIGIN_X + (x - z) * KX,
    y: ORIGIN_Y + (x + z) * KY + (TOP_LEVEL - level) * FLOOR_GAP,
  };
}

/** The four corners of a footprint rectangle on one floor, in draw order. */
export function quad(rect: Rect3, level: number): readonly Pt[] {
  return [
    project(rect.x0, rect.z0, level),
    project(rect.x1, rect.z0, level),
    project(rect.x1, rect.z1, level),
    project(rect.x0, rect.z1, level),
  ];
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function points(pts: readonly Pt[]): string {
  return pts.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
}

/** Same polygon, pushed straight down -- the underside of a slab. */
export function dropped(pts: readonly Pt[], by: number): readonly Pt[] {
  return pts.map((p) => ({ x: p.x, y: p.y + by }));
}

/**
 * Where a zone's name goes. Not the centroid: `depth` biases toward the
 * viewer so the label clears the strip hidden by the floor above.
 */
export function anchor(rect: Rect3, level: number, depth = 0.62): Pt {
  return at(rect, level, 0.5, depth);
}

/** A point inside a footprint, addressed by fraction rather than by unit. */
export function at(rect: Rect3, level: number, fx: number, fz: number): Pt {
  return project(
    rect.x0 + (rect.x1 - rect.x0) * fx,
    rect.z0 + (rect.z1 - rect.z0) * fz,
    level,
  );
}

export const LABEL_AT = { fx: 0.5, fz: 0.62 } as const;

/**
 * Where a zone's ambient life sits: the far side of the plate from its name.
 * The pulse and the thread share this point, so the two moving things on a
 * zone are one gesture rather than two competing for the same 40 pixels the
 * label already occupies.
 */
export const lifeAt = (label: { fx: number; fz: number }): { fx: number; fz: number } => ({
  fx: label.fx > 0.5 ? 0.2 : 0.8,
  fz: 0.5,
});

export function bbox(pts: readonly Pt[]): { x: number; y: number; width: number; height: number } {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// ------------------------------------------------------------------- the plan

/** The service core: lifts, risers, the spine every floor threads into. */
export const CORE: Rect3 = { x0: 400, z0: 0, x1: 450, z1: FOOTPRINT_D };

export const FLOORS: readonly number[] = [1, 2, 3, 4];

export const FLOOR_NAME: Readonly<Record<number, string>> = {
  4: "Level 04 · Inpatient",
  3: "Level 03 · Surgical",
  2: "Level 02 · Diagnostics",
  1: "Level 01 · Acute intake",
};

export interface ZonePlan {
  readonly id: string;
  readonly floor: number;
  readonly rect: Rect3;
  /**
   * Where the zone's name sits, as a fraction of its own footprint. Two zones
   * stacked front-to-back on one floor project to nearly the same screen
   * point, so their names collided until each got its own corner of the plate:
   * the rear zone labels left, the front zone labels right, and the axonometric
   * pulls them apart along x. Defaults to the middle-front of the zone.
   */
  readonly labelAt?: { readonly fx: number; readonly fz: number };
}

/**
 * Footprints for every zone the twin knows how to draw. A zone handed to the
 * component without an entry here is skipped rather than guessed at -- the
 * building is a fixed model, and inventing geometry for an unknown ward would
 * be the drawing equivalent of inventing a patient.
 */
export const ZONE_PLAN: readonly ZonePlan[] = [
  { id: "north-ward", floor: 4, rect: { x0: 0, z0: 0, x1: 400, z1: 160 }, labelAt: { fx: 0.62, fz: 0.4 } },
  { id: "south-ward", floor: 4, rect: { x0: 450, z0: 0, x1: 760, z1: 160 }, labelAt: { fx: 0.5, fz: 0.6 } },
  { id: "surgical", floor: 3, rect: { x0: 0, z0: 0, x1: 400, z1: 160 }, labelAt: { fx: 0.5, fz: 0.55 } },
  { id: "recovery", floor: 3, rect: { x0: 450, z0: 0, x1: 760, z1: 95 }, labelAt: { fx: 0.72, fz: 0.5 } },
  { id: "sterile", floor: 3, rect: { x0: 450, z0: 95, x1: 760, z1: 160 }, labelAt: { fx: 0.26, fz: 0.6 } },
  { id: "imaging", floor: 2, rect: { x0: 0, z0: 0, x1: 400, z1: 95 }, labelAt: { fx: 0.7, fz: 0.5 } },
  { id: "nuclear", floor: 2, rect: { x0: 0, z0: 95, x1: 400, z1: 160 }, labelAt: { fx: 0.6, fz: 0.62 } },
  { id: "pathology", floor: 2, rect: { x0: 450, z0: 0, x1: 760, z1: 160 }, labelAt: { fx: 0.5, fz: 0.58 } },
  { id: "emergency", floor: 1, rect: { x0: 0, z0: 0, x1: 400, z1: 160 }, labelAt: { fx: 0.62, fz: 0.4 } },
  { id: "reception", floor: 1, rect: { x0: 450, z0: 0, x1: 760, z1: 90 }, labelAt: { fx: 0.72, fz: 0.5 } },
  { id: "ambulance", floor: 1, rect: { x0: 450, z0: 90, x1: 760, z1: 160 }, labelAt: { fx: 0.26, fz: 0.62 } },
];

/**
 * The vertical structure. Columns run the visible gap between two plates, on
 * the front edge where the eye reads them as the building standing up.
 */
export const COLUMN_X: readonly number[] = [0, 190, 400, 570, 760];

export const planFor = (id: string): ZonePlan | undefined =>
  ZONE_PLAN.find((zone) => zone.id === id);

// ------------------------------------------------- inside the focused ward

const WARD = { x0: 0, z0: 0, x1: 400, z1: 160 } as const;
const INSET = 16;
const CORRIDOR = { front: 70, back: 90 };
const COLUMNS = 6;

function wardRooms(): readonly Rect3[] {
  const usable = WARD.x1 - INSET * 2;
  const gap = 7;
  const width = (usable - gap * (COLUMNS - 1)) / COLUMNS;
  const rows: readonly (readonly [number, number])[] = [
    [INSET, CORRIDOR.front],
    [CORRIDOR.back, WARD.z1 - INSET],
  ];
  const out: Rect3[] = [];
  for (const [z0, z1] of rows) {
    for (let index = 0; index < COLUMNS; index += 1) {
      const x0 = INSET + index * (width + gap);
      out.push({ x0, z0, x1: x0 + width, z1 });
    }
  }
  return out;
}

/** Twelve beds and a corridor. Bed identity lives in WardFloorPlan, not here. */
export const WARD_ROOMS: readonly Rect3[] = wardRooms();

export const WARD_CORRIDOR: Rect3 = {
  x0: INSET,
  z0: CORRIDOR.front,
  x1: WARD.x1 - INSET,
  z1: CORRIDOR.back,
};

export const WARD_STATION: Rect3 = {
  x0: 168,
  z0: CORRIDOR.front + 2,
  x1: 232,
  z1: CORRIDOR.back - 2,
};

// ------------------------------------------------------------------- framing

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Zoom 0: the whole building, with sky above it and ground below. */
export const FULL_VIEW: ViewBox = { x: -60, y: 20, width: 1000, height: 760 };

/** Zoom 1: the focused ward plate, padded just enough to breathe. */
export const FOCUS_VIEW: ViewBox = { x: 8, y: 30, width: 550, height: 184 };

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function lerpView(a: ViewBox, b: ViewBox, t: number): ViewBox {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
  };
}

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Smoothstep, so the optical move eases at both ends instead of snapping. */
export const ease = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/**
 * Normalised progress of one cross-fade inside the zoom. Everything that
 * appears or disappears during the move is expressed this way, so the whole
 * composition is a pure function of a single scalar.
 */
export const band = (value: number, from: number, to: number): number =>
  ease(clamp01((value - from) / (to - from)));
