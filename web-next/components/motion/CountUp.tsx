"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * A number that transitions to its next value instead of snapping to it.
 *
 * It animates the DISPLAY only. The value is whatever the caller passed on the
 * frame it passed it; there is no easing of clinical truth here, and the final
 * frame is always the exact number. `null` renders an em dash rather than NaN,
 * because a missing reading is a fact and 0 would be a lie.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 620,
  prefix = "",
  suffix = "",
  signDisplay = false,
  className,
}: {
  value: number | null;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  /** Always show the sign. For deltas, where "+2" and "2" mean different things. */
  signDisplay?: boolean;
  className?: string;
}) {
  const target = value !== null && Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState<number | null>(target);
  const fromRef = useRef<number | null>(target);
  const frameRef = useRef<number | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const from = fromRef.current;
    if (target === null || from === null || reduced || from === target || duration <= 0) {
      fromRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setShown(target);
      }
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      fromRef.current = target;
    };
  }, [duration, reduced, target]);

  if (shown === null) return <span className={className}>—</span>;

  // "-0" is not a reading. Normalise it before it reaches a clinician's eye.
  const rounded = shown.toFixed(decimals).replace(/^-0(\.0*)?$/, (match) => match.slice(1));
  const sign = signDisplay && !rounded.startsWith("-") && Number(rounded) !== 0 ? "+" : "";
  return (
    <span className={`tabular ${className ?? ""}`.trim()}>
      {prefix}
      {sign}
      {rounded}
      {suffix}
    </span>
  );
}
