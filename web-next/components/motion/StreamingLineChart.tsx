"use client";

import { useId, type CSSProperties } from "react";
import { DrawIn } from "./DrawIn";

export interface ChartPoint {
  /** Milliseconds. Used for the x position when the samples are spread in time. */
  t: number;
  value: number;
  /** The event this sample came from, when there is one. */
  id?: string;
}

/**
 * One observation's trajectory, drawn as it arrives.
 *
 * The shaded band is THIS PATIENT'S OWN baseline, not a population range --
 * same argument the ward sparkline makes, at presentation size. The line draws
 * in when a new sample lands so the eye is taken to the change rather than
 * having to find it, and the newest sample keeps a soft halo so "now" is never
 * ambiguous on a projector.
 *
 * Degrades rather than throws: no samples renders a labelled placeholder, one
 * sample renders a single dot on a flat rule, a flat series stays flat instead
 * of being stretched to fill the box and implying drama that is not there.
 */
export function StreamingLineChart({
  points,
  label,
  unit = "",
  baseline = null,
  bandTolerance,
  concerning = false,
  height = 132,
  formatX,
  emptyLabel = "No sample has been appended yet",
  showNow = true,
  color,
  theme = "light",
  className,
}: {
  points: ChartPoint[];
  label: string;
  unit?: string;
  baseline?: number | null;
  bandTolerance?: number;
  concerning?: boolean;
  height?: number;
  formatX?: (t: number) => string;
  emptyLabel?: string;
  showNow?: boolean;
  color?: string;
  /** The ground the chart sits on. Only affects the axis furniture, never the data. */
  theme?: "light" | "dark";
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const width = 640;
  const padX = 30;
  // A short chart has no room for generous padding, and a squashed trace reads
  // as a flat one -- which is the opposite of what it is usually showing.
  const padY = height < 100 ? 9 : 18;
  const dark = theme === "dark";
  const axisInk = dark ? "rgba(255,255,255,.45)" : "var(--faint)";
  const bandInk = dark ? "#79c9b4" : "var(--accent)";
  const showBaselineLabel = height >= 100;

  const clean = points
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.t))
    .sort((a, b) => a.t - b.t);

  if (clean.length === 0) {
    return (
      <figure className={className}>
        <ChartCaption label={label} unit={unit} dark={theme === "dark"} />
        <div
          className={`mt-2 flex items-center justify-center border border-dashed text-[10px] uppercase tracking-wide ${
            theme === "dark" ? "border-white/15 bg-white/[.03] text-white/40" : "border-line bg-white/40 text-faint"
          }`}
          style={{ height }}
        >
          {emptyLabel}
        </div>
      </figure>
    );
  }

  const values = clean.map((point) => point.value);
  const tolerance = bandTolerance ?? Math.max(1, Math.abs((baseline ?? values[0]) * 0.015));
  const candidates = [...values];
  if (baseline !== null && Number.isFinite(baseline)) candidates.push(baseline - tolerance, baseline + tolerance);
  const lo = Math.min(...candidates);
  const hi = Math.max(...candidates);
  // A flat series deserves to look flat. It also must not divide by zero.
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.05);
  const tLo = clean[0].t;
  const tHi = clean[clean.length - 1].t;
  const tSpan = tHi - tLo;

  const x = (point: ChartPoint, index: number): number => {
    if (clean.length === 1) return width / 2;
    // Equal spacing when every sample shares a timestamp, so they never stack.
    const ratio = tSpan > 0 ? (point.t - tLo) / tSpan : index / (clean.length - 1);
    return padX + ratio * (width - padX * 2);
  };
  const y = (value: number): number => padY + (1 - (value - lo) / span) * (height - padY * 2);

  const coordinates = clean.map((point, index) => ({ ...point, cx: x(point, index), cy: y(point.value) }));
  const line = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${round(point.cx)},${round(point.cy)}`).join(" ");
  const area = `${line} L${round(coordinates[coordinates.length - 1].cx)},${height - padY} L${round(coordinates[0].cx)},${height - padY} Z`;
  const stroke = color ?? (concerning ? "var(--lvl-high)" : "var(--accent)");
  const last = coordinates[coordinates.length - 1];

  return (
    <figure className={className}>
      <ChartCaption label={label} unit={unit} dark={dark} />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-auto w-full"
        role="img"
        aria-label={`${label}: ${clean.length} sample${clean.length === 1 ? "" : "s"}${
          baseline !== null ? `, personal baseline ${baseline}` : ""
        }, latest ${last.value}${unit}`}
      >
        <defs>
          <linearGradient id={`fill-${gradientId}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>

        {baseline !== null && Number.isFinite(baseline) && (
          <g className="motion-fade">
            <rect
              x={0}
              y={y(baseline + tolerance)}
              width={width}
              height={Math.max(2, y(baseline - tolerance) - y(baseline + tolerance))}
              fill={bandInk}
              opacity={dark ? 0.14 : 0.13}
            />
            <line
              x1={0}
              x2={width}
              y1={y(baseline)}
              y2={y(baseline)}
              stroke={bandInk}
              strokeOpacity={dark ? 0.6 : 0.6}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {showBaselineLabel && (
              <text x={4} y={Math.max(10, y(baseline) - 6)} fontSize={10} fill={dark ? axisInk : "var(--dim)"}>
                own baseline {formatNumber(baseline)}
              </text>
            )}
          </g>
        )}

        <path d={area} fill={`url(#fill-${gradientId})`} className="motion-fade" style={{ "--motion-delay": ".18s" } as CSSProperties} />
        <DrawIn
          key={`line-${clean.length}`}
          d={line}
          duration={Math.min(1.5, 0.42 + clean.length * 0.16)}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coordinates.map((point, index) => {
          const isLast = index === coordinates.length - 1;
          return (
            <g key={point.id ?? `${point.t}-${index}`}>
              <circle
                cx={point.cx}
                cy={point.cy}
                r={isLast ? 4 : 2.5}
                fill={isLast ? stroke : dark ? "#143b34" : "var(--surface)"}
                stroke={stroke}
                strokeWidth={1.5}
                className="motion-fade"
                style={{ "--motion-delay": `${0.3 + index * 0.12}s` } as CSSProperties}
              />
              {isLast && showNow && (
                <circle cx={point.cx} cy={point.cy} r={4} fill="none" stroke={stroke} strokeWidth={1.5} className="motion-now-halo" />
              )}
            </g>
          );
        })}

        {formatX && (
          <>
            <text x={padX} y={height - 3} fontSize={9} fill={axisInk}>
              {formatX(tLo)}
            </text>
            <text x={width - padX} y={height - 3} fontSize={9} fill={axisInk} textAnchor="end">
              {formatX(tHi)}
            </text>
          </>
        )}
      </svg>
    </figure>
  );
}

function ChartCaption({ label, unit, dark }: { label: string; unit: string; dark?: boolean }) {
  return (
    <figcaption className={`flex items-baseline gap-2 text-[9px] font-bold uppercase tracking-[.14em] ${dark ? "text-white/45" : "text-faint"}`}>
      {label}
      {unit ? <span className="font-medium normal-case tracking-normal">{unit}</span> : null}
    </figcaption>
  );
}

const round = (value: number): number => Math.round(value * 100) / 100;
const formatNumber = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));
