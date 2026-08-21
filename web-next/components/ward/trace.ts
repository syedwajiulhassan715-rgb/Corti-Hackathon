/**
 * A bed's living trace.
 *
 * Every occupied bed carries a waveform that never stops moving, because a
 * twin of a ward is a model of something alive and a still picture of a ward
 * is a floor plan. What the waveform is made of is not decoration: its rate,
 * its amplitude and its colour all come from the patient's own priority level
 * and their own concerning signals, so a calm bed breathes slowly and shallow
 * and an escalating one runs faster, taller and warmer.
 *
 * HONESTY: this is NOT the patient's real ECG. ECHO holds discrete
 * observations, not continuous telemetry, so drawing a real trace is
 * impossible and drawing a fake one that pretends to be real is forbidden.
 * The waveform is an animated status glyph whose shape is derived from level
 * and signal count; the screen says "trace shape is illustrative" beside it.
 * The numbers printed next to it are the real readings.
 *
 * Pure functions. No `now`, no state, no randomness -- the same patient always
 * draws the same shape, which is what makes replay reproducible.
 */

import type { PriorityLevel, QueueRow } from "@/lib/api";

export interface TraceSpec {
  /** SVG path for several periods of the waveform, laid out left to right. */
  readonly d: string;
  /** One period's width in user units; the animation shifts by exactly this. */
  readonly period: number;
  /** Seconds for one period to travel. Lower = more urgent. */
  readonly seconds: number;
  /** Token name for the level colour, e.g. "high". */
  readonly token: string;
  /** Stroke width, heavier as attention rises. */
  readonly stroke: number;
}

const TOKEN: Readonly<Record<PriorityLevel, string>> = {
  GREEN: "green",
  WATCH: "watch",
  PERSISTING_CONCERN: "concern",
  HIGH: "high",
  CRITICAL: "critical",
};

/** Seconds per period. Idle beds breathe; escalating beds pulse. */
const CADENCE: Readonly<Record<PriorityLevel, number>> = {
  GREEN: 7.2,
  WATCH: 5,
  PERSISTING_CONCERN: 3.8,
  HIGH: 2.8,
  CRITICAL: 2.1,
};

export function tokenFor(level: PriorityLevel | string): string {
  return TOKEN[level as PriorityLevel] ?? "green";
}

export function traceSpec(row: QueueRow, width: number, height: number): TraceSpec {
  const level = (row.level in TOKEN ? row.level : "GREEN") as PriorityLevel;
  const concerning = row.signals.filter((signal) => signal.concerning).length;
  const calm = level === "GREEN";

  // Amplitude grows with how much is actually moving, not with the level
  // alone -- two patients at WATCH for different amounts of evidence should
  // not look identical.
  const head = height / 2;
  const amplitude = Math.min(head - 2, (calm ? 3.2 : 5.4) + concerning * 1.6);
  const period = calm ? width / 1.6 : width / 2.4;
  const copies = Math.ceil(width / period) + 2;

  const points: string[] = [];
  for (let copy = 0; copy < copies; copy += 1) {
    const shift = copy * period;
    const shape = calm ? breath(period, head, amplitude) : complex(period, head, amplitude);
    for (const [x, y] of shape) {
      points.push(`${copy === 0 && points.length === 0 ? "M" : "L"}${round(shift + x)},${round(y)}`);
    }
  }

  return {
    d: points.join(" "),
    period,
    seconds: CADENCE[level],
    token: TOKEN[level],
    stroke: calm ? 1.4 : 1.7,
  };
}

/** A slow, near-sinusoidal rise and fall. Nothing is happening, calmly. */
function breath(period: number, mid: number, amplitude: number): [number, number][] {
  const steps = 26;
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push([t * period, mid - Math.sin(t * Math.PI * 2) * amplitude * 0.9]);
  }
  return points;
}

/**
 * A cardiac-shaped complex: quiet baseline, small atrial bump, sharp spike,
 * recovery wave. Not a real recording -- a legible glyph for "this one is
 * working harder", built from the same fractions every time.
 */
function complex(period: number, mid: number, amplitude: number): [number, number][] {
  const shape: [number, number][] = [
    [0.00, 0], [0.16, 0], [0.22, 0.24], [0.28, 0], [0.36, 0],
    [0.40, -0.18], [0.44, 1], [0.48, -0.42], [0.52, 0], [0.62, 0],
    [0.70, 0.42], [0.78, 0], [1.00, 0],
  ];
  return shape.map(([t, level]) => [t * period, mid - level * amplitude]);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
