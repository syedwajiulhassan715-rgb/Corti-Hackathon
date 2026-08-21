"use client";

import type { Rect } from "./geometry";

/**
 * The nurse station as a piece of furniture.
 *
 * It is a desk standing in the corridor: a counter with a raised lip, two
 * screens on it, a chair behind. It is the destination every escalation route
 * on this floor runs to, so it has to look like somewhere a person stands --
 * a rectangle captioned NURSE STATION would make the routes point at a label
 * instead of at a place.
 *
 * The only number it carries is the one it would carry in life: how many of
 * these patients are waiting on someone.
 */
export function NurseStation({
  rect,
  beds,
  attention,
}: {
  rect: Rect;
  beds: number;
  attention: number;
}) {
  const { x, y, w, h } = rect;
  return (
    <g aria-hidden>
      {/* A soft floor glow, so routes arriving here have somewhere to land. */}
      <ellipse
        className={attention > 0 ? "twin-station-glow" : undefined}
        cx={x + w / 2}
        cy={y + h / 2}
        rx={w * 0.6}
        ry={h * 0.72}
        fill="var(--accent)"
        opacity={attention > 0 ? 0.12 : 0.05}
      />

      {/* Chair, behind the counter. */}
      <rect x={x + w / 2 - 11} y={y + h + 4} width={22} height={14} rx={6} fill="var(--twin-corridor)" stroke="var(--twin-wall)" strokeWidth={0.9} strokeOpacity={0.4} />

      {/* The counter: body, then a raised front lip. */}
      <rect x={x} y={y} width={w} height={h} rx={5} fill="var(--surface)" stroke="var(--twin-wall)" strokeWidth={1.4} strokeOpacity={0.75} />
      <rect x={x} y={y + h - 13} width={w} height={13} rx={3} fill="var(--sunk)" stroke="var(--twin-wall)" strokeWidth={0.9} strokeOpacity={0.3} />

      {/* Two screens, angled on the desk. */}
      {[0, 1].map((index) => {
        const sx = x + 14 + index * 30;
        return (
          <g key={index}>
            <rect x={sx} y={y + 9} width={22} height={15} rx={2} fill="var(--twin-wall)" opacity={0.82} />
            <rect x={sx + 9} y={y + 24} width={4} height={4} fill="var(--twin-wall)" opacity={0.5} />
          </g>
        );
      })}

      <text
        x={x + 78}
        y={y + 20}
        fontSize={8.5}
        fontFamily="var(--font-mono)"
        letterSpacing="0.18em"
        fill="var(--faint)"
      >
        NURSE STATION
      </text>
      <text x={x + 78} y={y + 42} fontSize={20} fontWeight={500} fill="var(--ink)" className="twin-tabular">
        {attention}
      </text>
      <text x={x + 78 + String(attention).length * 12 + 6} y={y + 42} fontSize={10.5} fill="var(--dim)">
        of {beds} need review
      </text>
    </g>
  );
}
