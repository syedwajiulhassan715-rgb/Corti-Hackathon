"use client";

import { useMemo, useState } from "react";
import { BedDouble, CircleAlert, Search } from "lucide-react";
import type { QueueRow } from "@/lib/api";
import { signed, vocabularyFor } from "@/lib/clinical";
import { buildPlan, planRooms, routeToStation, type Plan } from "@/components/ward/geometry";
import { LEVEL_LABEL, RoomCell } from "@/components/ward/RoomCell";
import { NurseStation } from "@/components/ward/NurseStation";
import { TwinTelemetry } from "@/components/ward/TwinTelemetry";
import { tokenFor } from "@/components/ward/trace";
import "@/app/ward-twin.css";

/**
 * North Ward, as a digital twin.
 *
 * WHY A BUILDING AND NOT A GRID. The version this replaces was a four-column
 * grid of white cards with a tile in the middle that said NURSE STATION. It
 * was legible, and it was a table wearing a floor plan's clothes: nothing in
 * it could express distance, adjacency, or a patient who is not in their bed,
 * because a table has no space in it. A ward round is a walk. The board a
 * nurse trusts is the one shaped like the walk.
 *
 * So this is a real double-loaded corridor: two wings of rooms with walls,
 * numbered doorways, a corridor between them and a nurse station standing in
 * it as furniture. Every piece of state is now spatial:
 *
 *   - each bed carries a trace that never stops moving, whose rate, height and
 *     colour come from that patient's level and their own concerning signals;
 *   - a room off GREEN grows a ring out of its own walls;
 *   - the escalation is drawn as a route along the corridor from that room's
 *     door to the station, because that is literally what has to happen next;
 *   - a patient whose locationStatus is not `bed` is drawn IN THE CORRIDOR,
 *     with an empty dashed frame left in their room.
 *
 * WHAT IS REAL AND WHAT IS NOT. Levels, signals, deltas, baselines, room
 * numbers, location status and the event count are all the server's, folded
 * from the log. The building is invented -- ECHO knows which room a patient is
 * in and nothing about the shape of the ward -- and the waveform is a status
 * glyph, not a recording, because the log holds discrete observations and no
 * continuous telemetry. Both are labelled on screen. Fake the environment,
 * never the clinical path.
 *
 * NO NEW DEPENDENCIES. Inline SVG, CSS keyframes, one requestAnimationFrame
 * for the twin clock. The whole thing renders from a static export with the
 * network down; an empty ward draws an empty floor and never throws.
 */
export function WardFloorPlan({
  rows,
  selected,
  onSelect,
  events = 0,
  until = 0,
  live = false,
}: {
  rows: readonly QueueRow[];
  selected: string | null;
  onSelect: (patientId: string) => void;
  /** ward.generated_from_events -- how many events this drawing was folded from. */
  events?: number;
  /** The simulated moment the projection was taken at. */
  until?: number;
  /** True while a round is playing, so the twin clock shows it is being fed. */
  live?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);

  const byRoom = useMemo(() => {
    const map = new Map<string, QueueRow>();
    for (const row of rows) {
      const number = row.room?.match(/\d+/)?.[0];
      if (number !== undefined) map.set(number.padStart(2, "0"), row);
    }
    return map;
  }, [rows]);

  const plan = useMemo<Plan>(() => buildPlan(planRooms([...byRoom.keys()])), [byRoom]);

  const hits = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term === "") return null;
    return new Set(
      rows
        .filter((row) => row.name.toLowerCase().includes(term) || (row.room ?? "").toLowerCase().includes(term))
        .map((row) => row.patientId),
    );
  }, [query, rows]);

  // Anything off GREEN is something a nurse has to look at. Counting only
  // HIGH+CRITICAL here while the header counted everything produced a board
  // that said "0 need attention" and "1 need review" at the same time.
  const needReview = rows.filter((row) => row.level !== "GREEN").length;
  const midY = plan.corridor.y + plan.corridor.h / 2;

  return (
    <div className="twin bg-[#eef1f0]">
      <TwinTelemetry events={events} until={until} beds={rows.length} live={live} />

      <div className="flex flex-col gap-3 px-3 pb-3 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <label className="flex h-10 w-full items-center rounded-lg border border-line bg-white px-3 sm:max-w-[320px]">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a patient or room"
            className="min-w-0 flex-1 bg-transparent px-2.5 text-[13px] outline-none placeholder:text-faint"
          />
          <span className="sr-only">Find a patient or room</span>
        </label>
        <div className="flex items-center gap-4 text-[11px] text-dim">
          <span className="flex items-center gap-1.5">
            <BedDouble size={13} aria-hidden />
            <b className="twin-tabular font-semibold text-ink">{rows.length}</b> beds
          </span>
          <span className="flex items-center gap-1.5">
            <CircleAlert size={13} aria-hidden />
            <b className="twin-tabular font-semibold text-ink">{needReview}</b> need review
          </span>
        </div>
      </div>

      <div className="px-2 pb-2 sm:px-4 sm:pb-4">
        <svg
          className="twin-svg"
          viewBox={`0 0 ${plan.width} ${plan.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`North ward floor plan, ${rows.length} beds, ${needReview} need review`}
        >
          <defs>
            {/* The lift. One filter, reused -- a per-room shadow would cost a
                composite layer on every tile of a wall display. */}
            <filter id="twin-lift" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#1c3128" floodOpacity="0.16" />
            </filter>
            <pattern id="twin-tiles" width="46" height="46" patternUnits="userSpaceOnUse">
              <path d="M46 0 V46 M0 46 H46" fill="none" stroke="#26332f" strokeOpacity="0.05" strokeWidth="1" />
            </pattern>
            <pattern id="twin-hatch" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M-2 2 L2 -2 M0 10 L10 0 M8 12 L12 8" fill="none" stroke="#26332f" strokeOpacity="0.08" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Slab, corridor, tiling. */}
          <rect x={plan.outer.x} y={plan.outer.y} width={plan.outer.w} height={plan.outer.h} fill="var(--twin-floor)" />
          <rect
            x={plan.corridor.x}
            y={plan.corridor.y}
            width={plan.corridor.w}
            height={plan.corridor.h}
            fill="var(--twin-corridor)"
          />
          <rect
            x={plan.corridor.x}
            y={plan.corridor.y}
            width={plan.corridor.w}
            height={plan.corridor.h}
            fill="url(#twin-tiles)"
          />
          {/* The corridor's centre line, as painted on a real floor. */}
          <line
            x1={plan.corridor.x + 8}
            y1={midY}
            x2={plan.corridor.x + plan.corridor.w - 8}
            y2={midY}
            stroke="#26332f"
            strokeOpacity={0.1}
            strokeWidth={1}
            strokeDasharray="14 12"
          />

          {/* Building envelope, opened at both ends where the corridor leaves. */}
          <rect
            x={plan.outer.x}
            y={plan.outer.y}
            width={plan.outer.w}
            height={plan.outer.h}
            fill="none"
            stroke="var(--twin-wall)"
            strokeWidth={2}
            strokeOpacity={0.85}
          />
          {[plan.outer.x, plan.outer.x + plan.outer.w].map((x) => (
            <line
              key={x}
              x1={x}
              y1={midY - 26}
              x2={x}
              y2={midY + 26}
              stroke="var(--twin-corridor)"
              strokeWidth={3.5}
            />
          ))}

          {/* The bay at the end of the short wing. Not a patient space, so it
              carries no state and no colour -- just hatching and a name. */}
          {plan.service !== null && (
            <g aria-hidden>
              <rect x={plan.service.x} y={plan.service.y} width={plan.service.w} height={plan.service.h} fill="var(--twin-floor)" />
              <rect x={plan.service.x} y={plan.service.y} width={plan.service.w} height={plan.service.h} fill="url(#twin-hatch)" />
              <rect
                x={plan.service.x}
                y={plan.service.y}
                width={plan.service.w}
                height={plan.service.h}
                fill="none"
                stroke="var(--twin-wall)"
                strokeWidth={1.4}
                strokeOpacity={0.8}
              />
              <text
                x={plan.service.x + plan.service.w / 2}
                y={plan.service.y + plan.service.h / 2}
                textAnchor="middle"
                fontSize={9}
                fontFamily="var(--font-mono)"
                letterSpacing="0.2em"
                fill="var(--faint)"
              >
                UTILITY
              </text>
            </g>
          )}

          {/* Escalation routes: room door -> nurse station. Drawn on the floor,
              under everything, so they read as paint and not as wires. */}
          {plan.rooms.map((slot) => {
            const row = byRoom.get(slot.room);
            if (row === undefined || row.level === "GREEN") return null;
            if (hits !== null && !hits.has(row.patientId)) return null;
            return (
              <path
                key={`flow-${slot.room}`}
                className="twin-flow"
                d={routeToStation(slot.door, plan.station, plan.corridor)}
                fill="none"
                stroke={`var(--lvl-${tokenFor(row.level)})`}
                strokeWidth={1.5}
                strokeOpacity={0.55}
                strokeLinecap="round"
              />
            );
          })}

          <NurseStation rect={plan.station} beds={rows.length} attention={needReview} />

          {plan.rooms.map((slot) => {
            const row = byRoom.get(slot.room) ?? null;
            return (
              <RoomCell
                key={slot.room}
                slot={slot}
                row={row}
                selected={row !== null && row.patientId === selected}
                dimmed={row !== null && hits !== null && !hits.has(row.patientId)}
                onSelect={() => row !== null && onSelect(row.patientId)}
                onFocusRoom={setHovered}
              />
            );
          })}

          {/* Anyone not in their bed stands in the corridor, where they are. */}
          {plan.rooms.map((slot) => {
            const row = byRoom.get(slot.room);
            if (row === undefined || row.locationStatus === "bed") return null;
            const y = slot.wing === "top" ? midY - 34 : midY + 22;
            return <InCorridor key={`loc-${slot.room}`} x={slot.door.x} y={y} row={row} />;
          })}

          {/* The tether: on hover, the one reading that is moving most. */}
          {plan.rooms.map((slot) => {
            if (hovered !== slot.room) return null;
            const row = byRoom.get(slot.room);
            if (row === undefined) return null;
            return <Tether key={`tether-${slot.room}`} plan={plan} doorX={slot.door.x} wing={slot.wing} row={row} />;
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 pb-4 text-[11px] text-dim sm:px-5">
        {(["GREEN", "WATCH", "PERSISTING_CONCERN", "HIGH"] as const).map((level) => (
          <span key={level} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: `var(--lvl-${tokenFor(level)})` }} aria-hidden />
            {LEVEL_LABEL[level]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-faint">
          <span className="h-px w-4 border-t border-dashed border-faint" aria-hidden />
          Route to nurse station
        </span>
        <span className="ml-auto text-faint">Bed assignment and floor geometry are simulated · trace shape is illustrative</span>
      </div>
    </div>
  );
}

/**
 * A patient who is on a stretcher or walking. Their room keeps their number and
 * an empty frame; this is where they actually are.
 */
function InCorridor({ x, y, row }: { x: number; y: number; row: QueueRow }) {
  const initials = row.name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const w = 74;
  const left = Math.max(24, x - w / 2);
  return (
    <g aria-hidden>
      <rect x={left} y={y} width={w} height={16} rx={8} fill="var(--surface)" stroke="var(--line)" strokeWidth={1} />
      <circle cx={left + 9} cy={y + 8} r={4} fill={`var(--lvl-${tokenFor(row.level)})`} opacity={0.75} />
      <text x={left + 17} y={y + 11.5} fontSize={8.5} fill="var(--dim)" letterSpacing="0.04em">
        {initials} · {row.locationStatus}
      </text>
    </g>
  );
}

/**
 * The hover tether: a line from the room out into the corridor, ending in the
 * single reading that is moving most. It is deliberately one fact. The full
 * story lives in the patient panel, and a floor plan that tries to tell it
 * covers the two rooms either side of the one being described.
 */
function Tether({
  plan,
  doorX,
  wing,
  row,
}: {
  plan: Plan;
  doorX: number;
  wing: "top" | "bottom";
  row: QueueRow;
}) {
  const top = [...row.signals]
    .filter((signal) => signal.concerning)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))[0];

  const vocabulary = top === undefined ? null : vocabularyFor(top.observation);
  const text =
    top === undefined || vocabulary === null
      ? "At baseline · nothing moving"
      : `${vocabulary.label} ${top.current ?? "--"}${vocabulary.unit} ${top.delta === null ? "" : `${signed(top.delta)} vs baseline ${top.baseline ?? "--"}`}`.trim();

  // The label hugs the corridor wall it belongs to, in the band the nurse
  // station does not occupy. Floating it out into the middle of the corridor
  // put it on top of the station, which is both ugly and the one object on the
  // floor that must never be obscured.
  const h = 20;
  const w = Math.min(plan.width - 40, 20 + text.length * 5.1);
  const y = wing === "top" ? plan.corridor.y + 1 : plan.corridor.y + plan.corridor.h - h - 1;
  const x = Math.min(Math.max(doorX - w / 2, 22), plan.width - 22 - w);
  const wallY = wing === "top" ? plan.corridor.y : plan.corridor.y + plan.corridor.h;

  return (
    <g className="twin-tether">
      <line x1={doorX} y1={wallY} x2={doorX} y2={wing === "top" ? y + h : y} stroke="var(--ink)" strokeWidth={0.8} strokeOpacity={0.3} />
      <rect x={x} y={y} width={w} height={h} rx={4} fill="var(--ink)" />
      <text x={x + 10} y={y + 13.5} fontSize={9} fill="#ffffff" letterSpacing="0.01em">
        {text}
      </text>
    </g>
  );
}
