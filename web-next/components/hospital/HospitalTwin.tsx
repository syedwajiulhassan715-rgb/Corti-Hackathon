"use client";

/*
  ECHO's establishing shot: the hospital, as a building.

  The app opens on this. A stacked-floorplate model of the facility, drawn in a
  shallow axonometric, with four levels of named zones -- and exactly one of
  them alive. The camera then flies down into that one. `zoom` is the whole
  interface for the move: 0 frames the building, 1 fills the frame with North
  Ward, and every value between is a real intermediate composition rather than
  a cross-dissolve between two pictures. There is one SVG. Its viewBox
  interpolates. Nothing swaps.

  THE HONESTY LAW APPLIES TO DRAWINGS. Ten of the eleven zones here are
  scaffolding: an empty imaging suite, a surgical floor with nobody in it. They
  exist so the ward has a building around it, and they are labelled SIMULATED
  in the plan, carried as `live: false` in the data, given no counts, and named
  as simulated in a legend that never scrolls away. A synthetic floor that
  looks monitored would be a lie told in pixels, which is still a lie. North
  Ward is the only zone whose state comes from the event log, and it is the
  only zone that says LIVE.

  Ambient motion is CSS, not requestAnimationFrame. Every loop below is a
  keyframe on transform, opacity or stroke-dashoffset with a period read from a
  custom property, so the page runs no JavaScript per frame while it idles on
  screen -- which is the difference between a backdrop and a battery drain.
*/

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PriorityLevel, WardResponse } from "@/lib/api";
import {
  CORE,
  COLUMN_X,
  FLOOR_GAP,
  FLOOR_NAME,
  FLOORS,
  FOCUS_VIEW,
  FOOTPRINT_D,
  FOOTPRINT_W,
  FULL_VIEW,
  ISO_ANGLE,
  SLAB,
  WARD_CORRIDOR,
  WARD_ROOMS,
  WARD_STATION,
  LABEL_AT,
  lifeAt,
  ZONE_PLAN,
  anchor,
  at,
  band,
  bbox,
  clamp01,
  dropped,
  ease,
  lerpView,
  planFor,
  points,
  project,
  quad,
  type Pt,
  type Rect3,
  type ZonePlan,
} from "./geometry";
import "@/app/hospital-twin.css";

// --------------------------------------------------------------- the contract

export type HospitalZone = {
  id: string;
  floor: number;
  label: string;
  live: boolean;
  patients: number;
  needReview: number;
  topLevel: "GREEN" | "WATCH" | "PERSISTING_CONCERN" | "HIGH" | "CRITICAL" | null;
};

/** The one zone ECHO actually monitors. Everything else is context. */
export const LIVE_ZONE_ID = "north-ward";

const SYNTHETIC_LABEL: Readonly<Record<string, string>> = {
  "south-ward": "South Ward",
  surgical: "Surgical Theatres",
  recovery: "Recovery",
  sterile: "Sterile Services",
  imaging: "Imaging",
  nuclear: "Nuclear Medicine",
  pathology: "Pathology",
  emergency: "Emergency",
  reception: "Reception",
  ambulance: "Ambulance Bay",
};

function scaffolding(): HospitalZone[] {
  return ZONE_PLAN.filter((plan) => plan.id !== LIVE_ZONE_ID).map((plan) => ({
    id: plan.id,
    floor: plan.floor,
    label: SYNTHETIC_LABEL[plan.id] ?? plan.id,
    live: false,
    patients: 0,
    needReview: 0,
    topLevel: null,
  }));
}

/**
 * What the building looks like with no backend at all: correct geometry,
 * correct labels, zero live counts. A failing stage degrades to a missing
 * card, never a crash -- and here, never to an empty screen either.
 */
export const FALLBACK_ZONES: readonly HospitalZone[] = [
  {
    id: LIVE_ZONE_ID,
    floor: 4,
    label: "North Ward",
    live: true,
    patients: 0,
    needReview: 0,
    topLevel: null,
  },
  ...scaffolding(),
];

const LADDER: readonly PriorityLevel[] = [
  "GREEN",
  "WATCH",
  "PERSISTING_CONCERN",
  "HIGH",
  "CRITICAL",
];

/**
 * Ward data becomes building data. North Ward's counts are folded from the
 * queue the server actually returned; every other zone is emitted with `live:
 * false` and no numbers, because the alternative -- plausible-looking traffic
 * on the imaging floor -- is exactly the fabrication the honesty law forbids.
 */
export function zonesFromWard(ward: WardResponse | null): readonly HospitalZone[] {
  if (ward === null) return FALLBACK_ZONES;
  const queue = ward.queue ?? [];
  const present = new Set(queue.map((row) => row.level));
  const topLevel = [...LADDER].reverse().find((level) => present.has(level)) ?? null;
  return [
    {
      id: LIVE_ZONE_ID,
      floor: 4,
      label: "North Ward",
      live: true,
      patients: queue.length,
      needReview: queue.filter((row) => row.level !== "GREEN").length,
      topLevel,
    },
    ...scaffolding(),
  ];
}

export default FALLBACK_ZONES;

// ------------------------------------------------------------------- acuity

const LEVEL_WEIGHT: Readonly<Record<PriorityLevel, number>> = {
  GREEN: 0.14,
  WATCH: 0.4,
  PERSISTING_CONCERN: 0.6,
  HIGH: 0.82,
  CRITICAL: 1,
};

const LEVEL_VAR: Readonly<Record<PriorityLevel, string>> = {
  GREEN: "var(--lvl-green)",
  WATCH: "var(--lvl-watch)",
  PERSISTING_CONCERN: "var(--lvl-concern)",
  HIGH: "var(--lvl-high)",
  CRITICAL: "var(--lvl-critical)",
};

/**
 * How hard a zone breathes. For the live ward this is clinical: the worst
 * level present, tempered by how much of the ward it accounts for. For a
 * synthetic zone it is a flat constant -- deliberately not a random number,
 * because varied ambient activity across empty floors would read as data.
 */
function acuityOf(zone: HospitalZone): number {
  if (!zone.live) return 0.2;
  const worst = zone.topLevel === null ? 0.12 : LEVEL_WEIGHT[zone.topLevel];
  const share = zone.patients > 0 ? zone.needReview / zone.patients : 0;
  return clamp01(worst * 0.72 + share * 0.28);
}

const accentOf = (zone: HospitalZone): string =>
  zone.live && zone.topLevel !== null ? LEVEL_VAR[zone.topLevel] : "var(--h-glow)";

// ------------------------------------------------------------------- helpers

const CORE_CENTER_X = (CORE.x0 + CORE.x1) / 2;
const CORE_CENTER_Z = FOOTPRINT_D / 2;
const PLATE: Rect3 = { x0: 0, z0: 0, x1: FOOTPRINT_W, z1: FOOTPRINT_D };
const GROUND: Rect3 = { x0: -60, z0: -55, x1: 820, z1: 210 };

const distance = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

// ------------------------------------------------------------------ component

export function HospitalTwin(props: {
  zones: readonly HospitalZone[];
  zoom: number;
  focusZoneId: string;
  onFocusRect?: (rect: { x: number; y: number; width: number; height: number }) => void;
}): React.JSX.Element {
  const { zones, focusZoneId, onFocusRect } = props;
  const zoom = clamp01(Number.isFinite(props.zoom) ? props.zoom : 0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const t = ease(zoom);
  const view = lerpView(FULL_VIEW, FOCUS_VIEW, t);
  const viewBox = `${view.x} ${view.y} ${view.width} ${view.height}`;

  const focusPlan = planFor(focusZoneId) ?? planFor(LIVE_ZONE_ID);
  const focusFloor = focusPlan?.floor ?? 4;

  /** Building-scale chrome leaves first; ward-scale detail arrives after. */
  const buildingLabels = 1 - band(zoom, 0.08, 0.42);
  const wardDetail = band(zoom, 0.3, 0.78);
  const wardLabels = band(zoom, 0.52, 0.9);
  /**
   * Neighbours on the focused floor leave earlier than the floors below do.
   * They share the focus floor's full brightness, so on the plain zoom curve
   * South Ward was still the lightest shape on screen at half zoom -- the eye
   * went to the wrong ward at exactly the wrong moment.
   */
  const siblingFade = band(zoom, 0, 0.55);

  const drawn = useMemo(() => {
    const byId = new Map(zones.map((zone) => [zone.id, zone]));
    return ZONE_PLAN.flatMap((plan) => {
      const zone = byId.get(plan.id);
      return zone === undefined ? [] : [{ plan, zone }];
    });
  }, [zones]);

  // --- camera handoff -------------------------------------------------------
  // The focused zone's rect in viewport pixels, recomputed whenever the frame
  // or the element moves. preserveAspectRatio is xMidYMid meet, so the mapping
  // is a uniform scale plus the letterbox offset -- reproduced here rather
  // than read from getBoundingClientRect on a child, because the child is a
  // rotated polygon and its client rect would be its bounding box plus stroke.
  const emit = useCallback(() => {
    const svg = svgRef.current;
    if (svg === null || onFocusRect === undefined || focusPlan === undefined) return;
    const host = svg.getBoundingClientRect();
    if (host.width === 0 || host.height === 0) return;
    const scale = Math.min(host.width / view.width, host.height / view.height);
    const padX = (host.width - view.width * scale) / 2;
    const padY = (host.height - view.height * scale) / 2;
    const box = bbox(quad(focusPlan.rect, focusPlan.floor));
    onFocusRect({
      x: host.left + padX + (box.x - view.x) * scale,
      y: host.top + padY + (box.y - view.y) * scale,
      width: box.width * scale,
      height: box.height * scale,
    });
  }, [onFocusRect, focusPlan, view.x, view.y, view.width, view.height]);

  useEffect(() => {
    emit();
    const svg = svgRef.current;
    if (svg === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => emit());
    observer.observe(svg);
    window.addEventListener("scroll", emit, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", emit);
    };
  }, [emit]);

  const live = drawn.find((entry) => entry.zone.live)?.zone;

  return (
    <div className="htwin">
      <svg
        ref={svgRef}
        className="htwin-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          live === undefined
            ? "Hospital building model. North Ward is the live zone."
            : `Hospital building model. North Ward is live with ${live.patients} patients, ${live.needReview} needing review. All other zones are simulated context.`
        }
      >
        <Defs />

        <rect x={-400} y={-400} width={2200} height={2000} fill="url(#htwin-sky)" />
        <rect
          className="htwin-daylight"
          x={-400}
          y={-400}
          width={2200}
          height={2000}
          fill="url(#htwin-dusk)"
        />

        {/* Site and structure. It is what makes four slabs read as a building,
            and it is exactly what a camera inside one ward should not be
            looking at -- so it leaves as the zoom arrives. */}
        <g style={{ opacity: 1 - 0.92 * t }}>
          <Ground />
          <Columns />
          <Riser />
        </g>

        {FLOORS.map((level) => {
          const away = level === focusFloor ? 0 : t;
          return (
            <g
              key={level}
              className="htwin-plate"
              style={{
                opacity: 1 - 0.9 * away,
                filter: `saturate(${1 - 0.75 * away})`,
              }}
            >
              <Plate level={level} fade={level === focusFloor ? t : 0} />
              {drawn
                .filter((entry) => entry.plan.floor === level)
                .map(({ plan, zone }) => (
                  <Zone
                    key={plan.id}
                    plan={plan}
                    zone={zone}
                    dimmed={plan.id === focusZoneId ? 0 : siblingFade}
                  />
                ))}
              <Core level={level} />
              {drawn
                .filter((entry) => entry.plan.floor === level)
                .map(({ plan, zone }) => (
                  <Thread key={`${plan.id}-thread`} plan={plan} zone={zone} />
                ))}
              <FloorEdgeLabel level={level} opacity={buildingLabels} />
            </g>
          );
        })}

        {/* The focused ward's interior. Absent at zoom 0, resolved in by 0.78 --
            room outlines are a ward-scale fact and would be noise on a
            building-scale drawing. */}
        {focusPlan !== undefined && wardDetail > 0.002 && (
          <WardInterior
            rect={focusPlan.rect}
            level={focusPlan.floor}
            opacity={wardDetail}
            accent={live === undefined ? "var(--h-glow)" : accentOf(live)}
            labels={wardLabels}
          />
        )}

        {/* Zone names, at building scale. They cross-fade out as the ward's own
            labels come up, so the same places are never named twice at once. */}
        {buildingLabels > 0.002 && (
          <g style={{ opacity: buildingLabels }}>
            {drawn.map(({ plan, zone }) => (
              <ZoneLabel key={`${plan.id}-label`} plan={plan} zone={zone} />
            ))}
          </g>
        )}
      </svg>

      <div className="htwin-legend">
        <div className="htwin-legend-row">
          <span className="htwin-legend-dot" />
          <span>North Ward · live</span>
        </div>
        <p className="htwin-legend-note">
          <b>Simulated context.</b> Levels 01–03 and South Ward are an
          architectural model only — no monitoring, no patients, no data. North
          Ward is the one zone reading the event log.
        </p>
      </div>

      <div className="htwin-scale">
        <span className="htwin-scale-bar" />
        <span>10 m</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- pieces

function Defs(): React.JSX.Element {
  return (
    <defs>
      <linearGradient id="htwin-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0b2320" />
        <stop offset="58%" stopColor="#0a1d1a" />
        <stop offset="100%" stopColor="#061412" />
      </linearGradient>
      <linearGradient id="htwin-dusk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#123c33" />
        <stop offset="52%" stopColor="#0d2621" />
        <stop offset="100%" stopColor="#07100f" />
      </linearGradient>
      <linearGradient id="htwin-ground" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stopColor="#0d221e" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#061312" stopOpacity="0.2" />
      </linearGradient>
      <linearGradient id="htwin-plate" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#183a32" />
        <stop offset="100%" stopColor="#102a25" />
      </linearGradient>
      <radialGradient id="htwin-pulse" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#8fd0bd" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#8fd0bd" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function Ground(): React.JSX.Element {
  const top = quad(GROUND, 1);
  return (
    <polygon
      points={points(dropped(top, SLAB + 34))}
      fill="url(#htwin-ground)"
      stroke="#1d4038"
      strokeOpacity={0.5}
      strokeWidth={1}
    />
  );
}

/**
 * One floor's slab: the plate you stand on and the two faces you can see.
 *
 * `fade` darkens only the top surface, and only on the floor being flown into.
 * The focused floor is never dimmed as a whole -- it is the one you are
 * arriving at -- but leaving its whole plate lit made the rest of that level
 * the brightest thing on screen at half zoom, which pointed the eye at South
 * Ward exactly when it should have been on North.
 */
function Plate({ level, fade }: { level: number; fade: number }): React.JSX.Element {
  const top = quad(PLATE, level);
  const front: readonly Pt[] = [top[3], top[2], ...dropped([top[2], top[3]], SLAB)];
  const side: readonly Pt[] = [top[1], top[2], ...dropped([top[2], top[1]], SLAB)];
  return (
    <g>
      <polygon points={points(front)} fill="#0b201c" stroke="#22453c" strokeWidth={1} />
      <polygon points={points(side)} fill="#081916" stroke="#1c3a33" strokeWidth={1} />
      <polygon
        points={points(top)}
        fill="url(#htwin-plate)"
        fillOpacity={1 - 0.9 * fade}
        stroke="#2e5a4e"
        strokeWidth={1}
        strokeOpacity={1 - 0.7 * fade}
      />
    </g>
  );
}

function Zone({
  plan,
  zone,
  dimmed,
}: {
  plan: ZonePlan;
  zone: HospitalZone;
  dimmed: number;
}): React.JSX.Element {
  const { rect, floor: level } = plan;
  const shape = quad(rect, level);
  const accent = accentOf(zone);
  const acuity = acuityOf(zone);
  // The pulse sits across the plate from the zone's name. A soft blob directly
  // under 13px type turned both into mud in the first pass.
  const life = lifeAt(plan.labelAt ?? LABEL_AT);
  const centre = at(rect, level, life.fx, life.fz);
  // Slow when calm, quicker when the ward has something to say. Never fast:
  // the range is nine seconds to four, which is a breath, not a heartbeat.
  const period = `${(9 - acuity * 5).toFixed(2)}s`;
  const radius = 16 + acuity * 22;
  return (
    <g style={{ opacity: 1 - 0.86 * dimmed }}>
      <polygon
        points={points(shape)}
        fill={zone.live ? "#1d4c40" : "#12312b"}
        fillOpacity={zone.live ? 0.95 : 0.75}
        stroke={zone.live ? accent : "#3b6b5d"}
        strokeOpacity={zone.live ? 0.9 : 0.45}
        strokeWidth={zone.live ? 1.4 : 1}
      />
      <ellipse
        className="htwin-pulse"
        cx={centre.x}
        cy={centre.y}
        rx={radius}
        ry={radius * 0.28}
        fill="url(#htwin-pulse)"
        style={{ "--h-period": period, "--h-delay": `${level * 0.8}s` } as React.CSSProperties}
      />
    </g>
  );
}

/** The service core, on every floor: the spine the threads run into. */
function Core({ level }: { level: number }): React.JSX.Element {
  const shape = quad(CORE, level);
  const lift = quad({ x0: 410, z0: 56, x1: 440, z1: 104 }, level);
  return (
    <g>
      <polygon points={points(shape)} fill="#0d2822" stroke="#2b564a" strokeWidth={1} />
      <polygon
        points={points(lift)}
        fill="#123c33"
        stroke="#3f7566"
        strokeOpacity={0.7}
        strokeWidth={1}
      />
    </g>
  );
}

/** Traffic from a zone into the core. Faint, slow, and never labelled. */
function Thread({ plan, zone }: { plan: ZonePlan; zone: HospitalZone }): React.JSX.Element {
  const { rect, floor: level } = plan;
  const life = lifeAt(plan.labelAt ?? LABEL_AT);
  const from = at(rect, level, life.fx, life.fz);
  const to = project(CORE_CENTER_X, (rect.z0 + rect.z1) / 2, level);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 9 };
  const run = Math.round(distance(from, to));
  const acuity = acuityOf(zone);
  return (
    <path
      className="htwin-thread"
      d={`M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`}
      fill="none"
      stroke={zone.live ? accentOf(zone) : "#5f9384"}
      strokeWidth={zone.live ? 1.6 : 1}
      strokeLinecap="round"
      strokeDasharray={`${Math.max(14, run * 0.18)} ${run}`}
      style={{
        "--h-run": `${run + Math.max(14, run * 0.18)}`,
        "--h-period": `${(11 - acuity * 4).toFixed(2)}s`,
        "--h-delay": `${(level * 1.3 + rect.x0 / 400).toFixed(2)}s`,
      } as React.CSSProperties}
    />
  );
}

/** The vertical run between floors. Drawn once, behind the plates. */
function Riser(): React.JSX.Element {
  const segments = FLOORS.slice(0, -1).map((level) => ({
    level,
    a: project(CORE_CENTER_X, CORE_CENTER_Z, level),
    b: project(CORE_CENTER_X, CORE_CENTER_Z, level + 1),
  }));
  return (
    <g>
      {segments.map(({ level, a, b }) => (
        <g key={level}>
          <line
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#2a5145"
            strokeWidth={1}
            strokeOpacity={0.8}
          />
          <line
            className="htwin-riser-run"
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#71aa9b"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeDasharray="16 60"
            style={{
              "--h-period": "8s",
              "--h-delay": `${level * 1.6}s`,
            } as React.CSSProperties}
          />
        </g>
      ))}
    </g>
  );
}

/**
 * The building standing up. Faint verticals in the gap between plates, on the
 * front edge -- without them four floating slabs read as a diagram; with them
 * they read as a section through a building.
 */
function Columns(): React.JSX.Element {
  return (
    <g>
      {FLOORS.slice(0, -1).flatMap((level) =>
        COLUMN_X.map((x) => {
          const head = project(x, FOOTPRINT_D, level + 1);
          return (
            <line
              key={`${level}-${x}`}
              x1={head.x}
              y1={head.y + SLAB}
              x2={head.x}
              y2={head.y + FLOOR_GAP}
              stroke="#2a5145"
              strokeWidth={1}
              strokeOpacity={0.55}
            />
          );
        }),
      )}
    </g>
  );
}

function FloorEdgeLabel({ level, opacity }: { level: number; opacity: number }): React.JSX.Element {
  const at = project(30, FOOTPRINT_D, level);
  return (
    <text
      className="htwin-floor-label"
      x={at.x}
      y={at.y + SLAB * 0.74}
      transform={`rotate(${ISO_ANGLE.toFixed(2)} ${at.x.toFixed(2)} ${at.y.toFixed(2)})`}
      style={{ opacity }}
    >
      {FLOOR_NAME[level] ?? `Level ${level}`}
    </text>
  );
}

/**
 * A zone's name, set in the plane of its floor so it reads as part of the
 * drawing. The second line is the provenance: LIVE with real counts, or
 * SIMULATED with none. There is no third option.
 */
function ZoneLabel({ plan, zone }: { plan: ZonePlan; zone: HospitalZone }): React.JSX.Element {
  const place = plan.labelAt ?? LABEL_AT;
  const at = atFraction(plan, place.fx, place.fz);
  const rotate = `rotate(${ISO_ANGLE.toFixed(2)} ${at.x.toFixed(2)} ${at.y.toFixed(2)})`;
  const sub = zone.live
    ? `Live · ${zone.patients} patients · ${zone.needReview} need review`
    : "Simulated";
  return (
    <g transform={rotate}>
      <text
        className="htwin-label htwin-zone-name"
        x={at.x}
        y={at.y}
        textAnchor="middle"
        fill={zone.live ? "#f0f7f4" : "#a8c3ba"}
      >
        {zone.label}
      </text>
      <text className="htwin-label htwin-zone-sub" x={at.x} y={at.y + 13} textAnchor="middle">
        {sub}
      </text>
      {zone.live && (
        <circle
          cx={at.x - measure(zone.label) / 2 - 11}
          cy={at.y - 4}
          r={3}
          fill={accentOf(zone)}
        />
      )}
    </g>
  );
}

const atFraction = (plan: ZonePlan, fx: number, fz: number): Pt =>
  at(plan.rect, plan.floor, fx, fz);

/** Rough advance width for the label pip. Cheap, and only used for a dot. */
const measure = (text: string): number => text.length * 6.6;

function WardInterior({
  rect,
  level,
  opacity,
  accent,
  labels,
}: {
  rect: Rect3;
  level: number;
  opacity: number;
  accent: string;
  labels: number;
}): React.JSX.Element {
  const origin = { x: rect.x0, z: rect.z0 };
  const shift = (r: Rect3): Rect3 => ({
    x0: origin.x + r.x0,
    z0: origin.z + r.z0,
    x1: origin.x + r.x1,
    z1: origin.z + r.z1,
  });
  const corridor = quad(shift(WARD_CORRIDOR), level);
  const station = quad(shift(WARD_STATION), level);
  // Above the plate's rear-left corner, in the empty sky the axonometric
  // leaves there. Set upright, not in-plane: at ward scale this is a heading a
  // person reads, not a marking on a drawing.
  const name = project(origin.x - 30, origin.z - 46, level);
  return (
    <g style={{ opacity }}>
      <polygon points={points(corridor)} fill="#0f2b26" stroke="#39685b" strokeWidth={1} />
      {WARD_ROOMS.map((room, index) => {
        const shape = quad(shift(room), level);
        const at = anchor(shift(room), level, 0.62);
        return (
          <g key={index}>
            <polygon
              points={points(shape)}
              fill="#1c453b"
              stroke="#63a091"
              strokeOpacity={0.55}
              strokeWidth={1}
            />
            {labels > 0.002 && (
              <text
                className="htwin-label htwin-room-id"
                x={at.x}
                y={at.y}
                textAnchor="middle"
                transform={`rotate(${ISO_ANGLE.toFixed(2)} ${at.x.toFixed(2)} ${at.y.toFixed(2)})`}
                style={{ opacity: labels }}
              >
                {`R${String(index + 1).padStart(2, "0")}`}
              </text>
            )}
          </g>
        );
      })}
      <polygon
        points={points(station)}
        fill="#22574a"
        stroke={accent}
        strokeOpacity={0.55}
        strokeWidth={1}
      />
      {labels > 0.002 && (
        <g style={{ opacity: labels }}>
          <text className="htwin-label htwin-ward-name" x={name.x} y={name.y}>
            North Ward
          </text>
          <text className="htwin-label htwin-ward-sub" x={name.x} y={name.y + 7}>
            Live · 12 beds · Level 04
          </text>
        </g>
      )}
    </g>
  );
}
