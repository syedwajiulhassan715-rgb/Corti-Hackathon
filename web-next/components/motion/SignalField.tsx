"use client";

import type { CSSProperties } from "react";

/**
 * Ambient ground for the hero: slow drifting isolines.
 *
 * DELIBERATELY NOT DATA. It is generated from a fixed sine formula, carries no
 * axis, no scale and no numbers, and sits at single-digit opacity. A moving
 * line on a clinical surface that could be read as a patient trace would be
 * dishonest, so this one is built so it cannot be read as one.
 *
 * Deterministic: no Math.random, so the prerendered markup and the hydrated
 * markup are identical.
 */
export function SignalField({ className }: { className?: string }) {
  const width = 1200;
  const height = 420;
  const lines = [0, 1, 2, 3, 4, 5, 6];

  const path = (index: number): string => {
    const amplitude = 10 + index * 4;
    const wavelength = 250 + index * 38;
    const y0 = 44 + index * 52;
    const points: string[] = [];
    for (let x = 0; x <= width; x += 12) {
      const y =
        y0 +
        Math.sin((x / wavelength) * Math.PI * 2 + index) * amplitude +
        Math.sin((x / (wavelength * 0.37)) * Math.PI * 2 + index * 1.7) * (amplitude * 0.22);
      points.push(`${x === 0 ? "M" : "L"}${x},${Math.round(y * 100) / 100}`);
    }
    return points.join(" ");
  };

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`.trim()} aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <g className="motion-drift" style={{ "--motion-drift-duration": "68s", "--motion-drift-distance": `${width}px` } as CSSProperties}>
          {/* Two copies side by side so the drift wraps seamlessly. */}
          {[0, width].map((offset) => (
            <g key={offset} transform={`translate(${offset} 0)`}>
              {lines.map((index) => (
                <path
                  key={index}
                  d={path(index)}
                  fill="none"
                  stroke="#79c9b4"
                  strokeWidth={0.7}
                  className="motion-breathe"
                  style={
                    {
                      opacity: 0.05 + (index % 3) * 0.012,
                      "--motion-delay": `${index * 1.4}s`,
                      "--motion-breathe-duration": `${9 + index * 1.6}s`,
                    } as CSSProperties
                  }
                />
              ))}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
