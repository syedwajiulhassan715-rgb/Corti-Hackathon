"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BedDouble, CircleAlert, Search } from "lucide-react";
import type { QueueRow, QueueSignal } from "@/lib/api";
import { signed, vocabularyFor } from "@/lib/clinical";

/**
 * The ward, in plan.
 *
 * WHY THIS IS NOT THE ISOMETRIC SVG IT REPLACES. The previous version drew a
 * skewed 3D floor. It photographed well and read badly: skewX(-4deg) slanted
 * every label, room text sat at ~9px inside a fixed 1020x650 viewBox, and at
 * 375px the whole ward shrank to an illegible thumbnail. A ward board is read
 * at a glance, sometimes across a room, by someone already busy. Legibility
 * outranks the impression of depth, so the depth went.
 *
 * WHAT SURVIVED IS THE PART THAT WAS TRUE: the spatial arrangement. Rooms sit
 * where they sit on the floor, wrapped around a central nurse station, so the
 * board still maps to the place. That is the twin. The skew was decoration.
 *
 * THE SIGNATURE: every bed carries its own trajectory, not a status dot. A dot
 * says a patient is HIGH; these tiles say WHY -- which readings moved, from
 * what personal baseline, in which direction. The board reads as a field of
 * directions, which is the product thesis rendered spatially: ECHO watches
 * trajectory, not thresholds.
 *
 * THE RESTRAINT THAT MAKES IT WORK: a calm bed prints almost nothing. Only
 * concerning signals get ink, so the ward's visual weight equals its clinical
 * weight and the patient who needs attention is the one your eye lands on --
 * without a single flashing element.
 *
 * REMOVED DELIBERATELY, all of it fiction or noise:
 *   - the L1/L2/L3 floor selector. L1 and L3 held no patients and said
 *     "telemetry is active on Level 2". Inventing two floors of a hospital
 *     that does not exist is what the honesty law forbids.
 *   - the trajectory/occupancy/movement lens switch. "Occupancy" painted every
 *     room one colour; "movement" repeated a badge already on the tile.
 *   - "2 clinicians available" and "2 staff available", hardcoded strings with
 *     no roster behind them.
 *   - the hover tooltip, which covered the two rooms beside the one it
 *     described and repeated the panel on the right.
 */

/** Plan geometry. Row order is the corridor order, station in the middle. */
const PLAN: readonly string[] = [
  "01", "02", "03", "04",
  "09", "STATION", "11", "10",
  "05", "06", "07", "08",
];

const LEVEL_TOKEN: Readonly<Record<string, string>> = {
  GREEN: "green",
  WATCH: "watch",
  PERSISTING_CONCERN: "concern",
  HIGH: "high",
  CRITICAL: "critical",
};

/** Shorthand a nurse reads faster than the full ladder name. */
const LEVEL_LABEL: Readonly<Record<string, string>> = {
  GREEN: "Stable",
  WATCH: "Watch",
  PERSISTING_CONCERN: "Persisting",
  HIGH: "Attention",
  CRITICAL: "Critical",
};

export function WardFloorPlan({
  rows,
  selected,
  onSelect,
}: {
  rows: readonly QueueRow[];
  selected: string | null;
  onSelect: (patientId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const byRoom = useMemo(() => {
    const map = new Map<string, QueueRow>();
    for (const row of rows) {
      const number = row.room?.match(/\d+/)?.[0];
      if (number !== undefined) map.set(number.padStart(2, "0"), row);
    }
    return map;
  }, [rows]);

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

  return (
    <div className="bg-[#eef1f0] p-3 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <b className="font-semibold tabular-nums text-ink">{rows.length}</b> beds
          </span>
          <span className="flex items-center gap-1.5">
            <CircleAlert size={13} aria-hidden />
            <b className="font-semibold tabular-nums text-ink">{needReview}</b> need review
          </span>
        </div>
      </div>

      {/*
        Four fixed columns, because the columns ARE the floor. auto-fit
        reflowed twelve cells into three and put the nurse station out in a
        corridor -- at which point the layout is a list wearing a floor plan's
        clothes. Below `lg` the plan genuinely cannot hold, so it degrades to
        two honest columns rather than a squashed lie.
      */}
      <div
        className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3"
        role="list"
        aria-label="North ward, level 2"
      >
        {PLAN.map((cell) => {
          if (cell === "STATION") {
            return <NurseStation key="station" beds={rows.length} attention={needReview} />;
          }
          const row = byRoom.get(cell);
          if (row === undefined) return <EmptyRoom key={cell} room={cell} />;
          return (
            <RoomTile
              key={row.patientId}
              room={cell}
              row={row}
              active={row.patientId === selected}
              dimmed={hits !== null && !hits.has(row.patientId)}
              onSelect={() => onSelect(row.patientId)}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-dim">
        {(["GREEN", "WATCH", "PERSISTING_CONCERN", "HIGH"] as const).map((level) => (
          <span key={level} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: `var(--lvl-${LEVEL_TOKEN[level]})` }}
              aria-hidden
            />
            {LEVEL_LABEL[level]}
          </span>
        ))}
        <span className="ml-auto text-faint">Bed assignment is simulated</span>
      </div>
    </div>
  );
}

function RoomTile({
  room,
  row,
  active,
  dimmed,
  onSelect,
}: {
  room: string;
  row: QueueRow;
  active: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const token = LEVEL_TOKEN[row.level] ?? "green";
  const calm = row.level === "GREEN";
  // Only what is actually moving earns ink.
  const moving = row.signals.filter((signal) => signal.concerning).slice(0, 3);
  const offBed = row.locationStatus !== "bed";

  return (
    <button
      onClick={onSelect}
      aria-label={`Room ${room}, ${row.name}, ${LEVEL_LABEL[row.level] ?? row.level}`}
      aria-pressed={active}
      className={`group relative flex min-h-[118px] flex-col rounded-xl border bg-surface p-3 text-left transition ${
        dimmed ? "opacity-35" : ""
      } ${
        active
          ? "border-ink shadow-[0_8px_28px_rgba(28,49,43,0.13)]"
          : "border-line hover:border-dim hover:shadow-sm"
      }`}
    >
      {/* State is carried by a coloured rail AND a word. Never colour alone. */}
      <span
        className="absolute inset-y-3 left-0 w-[3px] rounded-r"
        style={{ background: calm ? "transparent" : `var(--lvl-${token})` }}
        aria-hidden
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] font-medium tracking-wide text-faint">{room}</span>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: calm ? "var(--faint)" : `var(--lvl-${token})` }}
        >
          {LEVEL_LABEL[row.level] ?? row.level}
        </span>
      </div>

      <p className="mt-1.5 truncate text-[14px] font-medium tracking-[-0.01em]">{row.name}</p>

      {offBed && (
        <span className="mt-1 w-fit rounded bg-sunk px-1.5 py-0.5 text-[10px] font-medium capitalize text-dim">
          On {row.locationStatus}
        </span>
      )}

      <div className="mt-2.5">
        {moving.length === 0 ? (
          <p className="text-[11px] text-faint">No change from baseline</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {moving.map((signal) => (
              <SignalRow key={signal.observation} signal={signal} />
            ))}
          </ul>
        )}
      </div>
    </button>
  );
}

/** One reading, against this patient's own baseline. */
function SignalRow({ signal }: { signal: QueueSignal }) {
  const vocabulary = vocabularyFor(signal.observation);
  // Arrow comes from the SIGN OF THE DELTA, never from `direction`. Direction
  // is improving/stable/worsening -- a clinical judgement, not a geometry --
  // so testing it for "rising" silently pointed every arrow down, including
  // the one beside a +31 systolic. The number and the glyph must never
  // disagree; a reader trusts the glyph first.
  const rising = (signal.delta ?? 0) > 0;
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;
  return (
    <li className="flex items-center gap-1.5 text-[11px] leading-none">
      <span className="w-9 shrink-0 font-mono text-[10px] text-faint">{vocabulary.short}</span>
      <span className="font-semibold tabular-nums">{signal.current}</span>
      <span className="text-[9px] text-faint">{vocabulary.unit}</span>
      {signal.delta !== null && (
        <span
          className="ml-auto flex items-center gap-0.5 font-medium tabular-nums"
          style={{ color: "var(--lvl-high)" }}
        >
          <Arrow size={11} aria-hidden />
          {signed(signal.delta)}
        </span>
      )}
    </li>
  );
}

function NurseStation({ beds, attention }: { beds: number; attention: number }) {
  return (
    <div className="flex min-h-[118px] flex-col justify-center rounded-xl border border-dashed border-[#b9c6c1] bg-[#e3eae7] p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Nurse station</p>
      <p className="mt-2 text-[22px] font-medium leading-none tabular-nums">{attention}</p>
      <p className="mt-1 text-[11px] text-dim">of {beds} need review</p>
    </div>
  );
}

function EmptyRoom({ room }: { room: string }) {
  return (
    <div className="flex min-h-[118px] flex-col rounded-xl border border-dashed border-line p-3">
      <span className="font-mono text-[11px] text-faint">{room}</span>
      <span className="mt-auto text-[11px] text-faint">Unoccupied</span>
    </div>
  );
}
