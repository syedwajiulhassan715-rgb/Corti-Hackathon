"use client";

import type { CSSProperties } from "react";
import type { QueueRow, QueueSignal } from "@/lib/api";
import { signed, vocabularyFor } from "@/lib/clinical";
import { tokenFor, traceSpec } from "./trace";
import { doorSwing, wallPath, type RoomSlot } from "./geometry";

/**
 * One room, drawn as a room.
 *
 * The walls are strokes with a real doorway cut in them and the number is set
 * into the wall the way a ward numbers its doors -- not because a floor plan
 * is prettier than a card, but because a nurse already carries a map of this
 * place in their head, and a board that matches that map is read rather than
 * decoded.
 *
 * The restraint from the card version survives intact: a calm bed prints
 * almost nothing. Only signals that are actually moving get ink, so the ward's
 * visual weight equals its clinical weight and the patient who needs attention
 * is the one your eye lands on.
 */

/** Shorthand a nurse reads faster than the full ladder name. */
export const LEVEL_LABEL: Readonly<Record<string, string>> = {
  GREEN: "Stable",
  WATCH: "Watch",
  PERSISTING_CONCERN: "Persisting",
  HIGH: "Attention",
  CRITICAL: "Critical",
};

/** The ladder, weakest first. Mirrors LADDER in engines/rules/priority.rules.ts. */
const LADDER: readonly string[] = ["GREEN", "WATCH", "PERSISTING_CONCERN", "HIGH", "CRITICAL"];

/**
 * Which way a patient moved since the board's lookback, or null for "the
 * board cannot say". Three distinct answers collapse to null on purpose:
 * no row, no previous level (the server could not look back that far), and
 * a level that did not change. None of them is a move, and a board that
 * printed "unchanged" on nine calm rooms would bury the two that moved.
 */
function levelDelta(row: QueueRow | null): { readonly from: string; readonly rose: boolean } | null {
  if (row === null || row.previousLevel === null) return null;
  if (row.previousLevel === row.level) return null;
  const from = LADDER.indexOf(row.previousLevel);
  const to = LADDER.indexOf(row.level);
  if (from < 0 || to < 0) return null; // an unknown rung is not a direction
  return { from: LEVEL_LABEL[row.previousLevel] ?? row.previousLevel, rose: to > from };
}

const TRACE_H = 32;

export function RoomCell({
  slot,
  row,
  selected,
  dimmed,
  onSelect,
  onFocusRoom,
}: {
  slot: RoomSlot;
  row: QueueRow | null;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onFocusRoom: (room: string | null) => void;
}) {
  const { x, y, w, h } = slot.rect;
  const oy = slot.wing === "top" ? 16 : 22;
  const numberY = slot.wing === "top" ? y : y + h;
  const outerEdge = numberY;
  const traceW = w - 24;

  const level = row?.level ?? "GREEN";
  const token = tokenFor(level);
  const calm = level === "GREEN";
  const offBed = row !== null && row.locationStatus !== "bed";
  const moving = (row?.signals ?? []).filter((signal) => signal.concerning).slice(0, 3);
  const spec = row === null ? null : traceSpec(row, traceW, TRACE_H);

  // What this patient climbed FROM, when the board knows and it changed.
  // previousLevel is null whenever the server could not look back far enough
  // to say -- which is not the same as "did not move", so it prints nothing
  // rather than guessing "unchanged".
  const moved = levelDelta(row);

  const label =
    row === null
      ? `Room ${slot.room}, unoccupied`
      : `Room ${slot.room}, ${row.name}, ${LEVEL_LABEL[row.level] ?? row.level}${
          moved === null ? "" : `, ${moved.rose ? "risen" : "eased"} from ${moved.from}`
        }${offBed ? `, on ${row.locationStatus}` : ""}`;

  return (
    <g
      className={`twin-room${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${row === null ? " is-empty" : ""}`}
      role={row === null ? undefined : "button"}
      tabIndex={row === null ? undefined : 0}
      aria-label={row === null ? undefined : label}
      onClick={row === null ? undefined : onSelect}
      onKeyDown={(event) => {
        if (row === null) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={() => onFocusRoom(row === null ? null : slot.room)}
      onMouseLeave={() => onFocusRoom(null)}
      onFocus={() => onFocusRoom(row === null ? null : slot.room)}
      onBlur={() => onFocusRoom(null)}
    >
      {/* The room's own floor. Occupied rooms sit lighter than the corridor. */}
      <rect
        className="twin-room-floor"
        x={x + 1}
        y={y + 1}
        width={w - 2}
        height={h - 2}
        fill={row === null ? "var(--twin-floor)" : "var(--twin-room)"}
      />

      {/* Escalation, expressed as a ring growing out of the room itself. */}
      {row !== null && !calm && (
        <rect
          className="twin-halo"
          x={x + 3}
          y={y + 3}
          width={w - 6}
          height={h - 6}
          fill="none"
          stroke={`var(--lvl-${token})`}
          strokeWidth={2.5}
        />
      )}

      {/* Walls, with a doorway cut into the corridor side. */}
      <path d={wallPath(slot)} fill="none" stroke="var(--twin-wall)" strokeWidth={1.4} strokeOpacity={0.8} />
      <path d={doorSwing(slot)} fill="none" stroke="var(--twin-wall)" strokeWidth={0.8} strokeOpacity={0.18} />

      {/* A window in the outer wall. Pure architecture -- it carries no state,
          and it is the detail that stops the wall reading as a table border. */}
      <g stroke="var(--twin-wall)" strokeOpacity={0.55}>
        <line x1={x + w * 0.1} y1={outerEdge} x2={x + w * 0.36} y2={outerEdge} stroke="var(--twin-floor)" strokeWidth={3.2} strokeOpacity={1} />
        <line x1={x + w * 0.1} y1={outerEdge - 1.6} x2={x + w * 0.36} y2={outerEdge - 1.6} strokeWidth={0.9} />
        <line x1={x + w * 0.1} y1={outerEdge + 1.6} x2={x + w * 0.36} y2={outerEdge + 1.6} strokeWidth={0.9} />
      </g>

      {/* The number is set INTO the wall: a gap in the stroke, then the digits. */}
      <rect x={x + w / 2 - 25} y={numberY - 9} width={50} height={18} fill="var(--twin-floor)" />
      <text
        x={x + w / 2}
        y={numberY + 4}
        textAnchor="middle"
        fontSize={10.5}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        fill="var(--dim)"
      >
        {slot.room}
      </text>

      <Bed x={x + 12} y={y + oy + 8} wing={slot.wing} occupied={row !== null} offBed={offBed} token={token} calm={calm} />

      {row === null ? (
        <text x={x + 62} y={y + oy + 34} fontSize={10} fill="var(--faint)">
          Unoccupied
        </text>
      ) : (
        <>
          {moving.length === 0 ? (
            <text x={x + 62} y={y + oy + 26} fontSize={9.5} fill="var(--faint)">
              At baseline
            </text>
          ) : (
            moving.map((signal, index) => (
              <SignalLine key={signal.observation} x={x + 62} y={y + oy + 26 + index * 15} signal={signal} />
            ))
          )}

          <text x={x + 12} y={y + oy + 94} fontSize={12.5} fontWeight={500} fill="var(--ink)" letterSpacing="-0.01em">
            {clip(row.name, Math.floor((w - 24) / 6.4))}
          </text>

          <circle cx={x + 15} cy={y + oy + 104} r={2.6} fill={calm ? "var(--faint)" : `var(--lvl-${token})`} />
          <text
            x={x + 23}
            y={y + oy + 107.5}
            fontSize={8.5}
            fontWeight={600}
            letterSpacing="0.11em"
            fill={calm ? "var(--faint)" : `var(--lvl-${token})`}
          >
            {(offBed ? `On ${row.locationStatus}` : LEVEL_LABEL[row.level] ?? row.level).toUpperCase()}
          </text>

          {/* The move, right-aligned against the far wall so it never collides
              with the level word on the left. Dim and small: WHERE a patient
              is now is the headline, where they came from is the footnote.
              The arrow is doubled by the word beside it and by the aria-label
              above, so nothing here is carried by shape or colour alone. */}
          {moved !== null && (
            <text
              x={x + w - 12}
              y={y + oy + 107.5}
              textAnchor="end"
              fontSize={7.5}
              fontWeight={500}
              fill="var(--faint)"
            >
              {moved.rose ? "↑" : "↓"} {moved.from}
            </text>
          )}

          {spec !== null && (
            <g transform={`translate(${x + 12} ${y + oy + 114})`}>
              <rect width={traceW} height={TRACE_H} fill="var(--sunk)" fillOpacity={0.55} rx={2} />
              <line x1={0} y1={TRACE_H / 2} x2={traceW} y2={TRACE_H / 2} stroke="var(--line)" strokeWidth={0.6} />
              <clipPath id={`twin-clip-${slot.room}`}>
                <rect width={traceW} height={TRACE_H} />
              </clipPath>
              <g clipPath={`url(#twin-clip-${slot.room})`}>
                <g
                  className="twin-trace twin-trace-run"
                  style={
                    {
                      "--twin-shift": `${-spec.period}px`,
                      "--twin-seconds": `${spec.seconds}s`,
                    } as CSSProperties
                  }
                >
                  <path
                    d={spec.d}
                    fill="none"
                    stroke={`var(--lvl-${spec.token})`}
                    strokeWidth={spec.stroke}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              </g>
            </g>
          )}
        </>
      )}

      {/* Selection is an ink outline, never colour alone -- the level colours
          are already spoken for and a selected HIGH room must still read HIGH. */}
      {selected && (
        <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} fill="none" stroke="var(--ink)" strokeWidth={1.8} />
      )}

      <rect
        className="twin-focus-ring"
        x={x + 2}
        y={y + 2}
        width={w - 4}
        height={h - 4}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
      />
    </g>
  );
}

/** One reading, against this patient's own baseline. */
function SignalLine({ x, y, signal }: { x: number; y: number; signal: QueueSignal }) {
  const vocabulary = vocabularyFor(signal.observation);
  // The arrow comes from the SIGN OF THE DELTA, never from `direction`.
  // Direction is improving/stable/worsening -- a clinical judgement, not a
  // geometry -- so testing it for "rising" points every arrow down, including
  // the one beside a +31 systolic. The number and the glyph must never
  // disagree; a reader trusts the glyph first.
  const rising = (signal.delta ?? 0) > 0;
  return (
    <g>
      <text x={x} y={y} fontSize={8.5} fontFamily="var(--font-mono)" fill="var(--faint)">
        {vocabulary.short}
      </text>
      <text x={x + 24} y={y} fontSize={10.5} fontWeight={600} fill="var(--ink)" className="twin-tabular">
        {signal.current ?? "--"}
      </text>
      {signal.delta !== null && (
        <text x={x + 48} y={y} fontSize={8.5} fontWeight={500} fill="var(--lvl-high)" className="twin-tabular">
          {rising ? "↑" : "↓"}
          {signed(signal.delta)}
        </text>
      )}
    </g>
  );
}

/**
 * A bed, from above: frame, mattress, pillow at the head, head to the outer
 * wall the way beds are pushed. An empty dashed frame means the patient is not
 * in it -- the board must never draw someone lying in a bed they left.
 */
function Bed({
  x,
  y,
  wing,
  occupied,
  offBed,
  token,
  calm,
}: {
  x: number;
  y: number;
  wing: "top" | "bottom";
  occupied: boolean;
  offBed: boolean;
  token: string;
  calm: boolean;
}) {
  const w = 44;
  const h = 60;
  const pillowY = wing === "top" ? y + 6 : y + h - 16;
  const filled = occupied && !offBed;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        fill={filled ? "var(--sunk)" : "none"}
        stroke={filled && !calm ? `var(--lvl-${token})` : "var(--line)"}
        strokeWidth={1.1}
        strokeDasharray={filled ? undefined : "3 3"}
      />
      {filled && (
        <>
          <rect
            x={x + 8}
            y={pillowY}
            width={w - 16}
            height={10}
            rx={3}
            fill="var(--surface)"
            stroke="var(--line)"
            strokeWidth={0.8}
          />
          <rect
            x={x + 6}
            y={wing === "top" ? y + 20 : y + 12}
            width={w - 12}
            height={h - 32}
            rx={3}
            fill={calm ? "var(--surface)" : `color-mix(in srgb, var(--lvl-${token}) 13%, var(--surface))`}
            stroke="var(--line)"
            strokeWidth={0.8}
          />
        </>
      )}
    </g>
  );
}

function clip(text: string, max: number): string {
  if (max < 4 || text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
