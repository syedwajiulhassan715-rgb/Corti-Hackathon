"use client";

import type { CSSProperties, SVGProps } from "react";

/**
 * An SVG path that draws itself.
 *
 * `pathLength={1}` normalises every path to a single dash unit, so one
 * keyframe works for a 40px connector and a 600px trend line alike and no
 * component has to measure geometry at runtime.
 */
export function DrawIn({
  d,
  duration = 1.1,
  delay = 0,
  className,
  style,
  ...rest
}: { d: string; duration?: number; delay?: number } & Omit<SVGProps<SVGPathElement>, "d" | "pathLength">) {
  const vars = {
    "--motion-draw-duration": `${duration}s`,
    "--motion-delay": `${delay}s`,
    ...(style ?? {}),
  } as CSSProperties;

  return <path d={d} pathLength={1} className={`motion-draw ${className ?? ""}`.trim()} style={vars} {...rest} />;
}
