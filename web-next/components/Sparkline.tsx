"use client";

import type { SeriesPoint } from "@/lib/api";

/**
 * A trend, with THIS PATIENT'S OWN BASELINE drawn behind it.
 *
 * The shaded band is the argument the whole product makes. 145/90 is
 * unremarkable against a population range and a large move against a personal
 * baseline of 128/80 — so the band is the baseline, not a normal range, and
 * without it this is just another line chart. Everything else here is in
 * service of making that one comparison legible at a glance.
 *
 * Inline SVG, no chart library: a handful of points, and a dependency would
 * cost more in bundle and risk than it saves in code.
 */
export function Sparkline({
  points,
  baseline,
  concerning,
  width = 220,
  height = 52,
}: {
  points: SeriesPoint[];
  baseline: number | null;
  concerning: boolean;
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return <div className="text-tiny text-faint">no readings</div>;
  }

  const values = points.map((p) => p.value);
  const lo = Math.min(...values, baseline ?? Infinity);
  const hi = Math.max(...values, baseline ?? -Infinity);
  // A flat series would divide by zero and also deserves to look flat rather
  // than being stretched to fill the box and implying drama that is not there.
  const span = hi - lo || 1;
  const pad = 6;

  const x = (i: number) =>
    points.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const stroke = concerning ? "var(--lvl-high)" : "var(--dim)";

  return (
    <svg
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-w-full overflow-hidden"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${points.length} readings, ${concerning ? "moving in the concerning direction" : "stable"}`}
    >
      {baseline !== null && (
        <>
          <line
            x1={0}
            x2={width}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text x={0} y={y(baseline) - 4} className="text-[9px]" fill="var(--faint)">
            baseline {baseline}
          </text>
        </>
      )}
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={p.eventId}
          cx={x(i)}
          cy={y(p.value)}
          r={i === points.length - 1 ? 3 : 1.75}
          fill={i === points.length - 1 ? stroke : "var(--faint)"}
        />
      ))}
    </svg>
  );
}
