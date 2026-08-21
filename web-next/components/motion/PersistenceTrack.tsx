"use client";

import type { CSSProperties } from "react";

export interface PersistenceGate {
  /** Hours the change must hold before this gate opens. */
  hours: number;
  label: string;
}

/**
 * How long a change has HELD, drawn rather than asserted.
 *
 * The product's whole claim is that one reading is not an alert and a
 * persistent move is. Text saying "4h persistence · 5 samples" states that;
 * this shows it -- one mark per sample, laid out on the time axis, with the
 * reviewed gates marked so a judge can see which ones the run actually crossed
 * and which it did not. Gates not yet crossed stay visibly not crossed.
 */
export function PersistenceTrack({
  persistenceMs,
  sampleCount,
  gates = [
    { hours: 1, label: "1h" },
    { hours: 2, label: "2h" },
    { hours: 4, label: "4h" },
  ],
  inverse = false,
  className,
}: {
  persistenceMs: number;
  sampleCount: number;
  gates?: PersistenceGate[];
  inverse?: boolean;
  className?: string;
}) {
  const hours = Number.isFinite(persistenceMs) ? Math.max(0, persistenceMs) / 3_600_000 : 0;
  const ceiling = Math.max(hours, gates.length ? gates[gates.length - 1].hours : 1, 1);
  const held = Math.min(100, (hours / ceiling) * 100);
  const samples = Math.max(0, Math.min(24, Math.round(sampleCount)));
  const rail = inverse ? "bg-white/15" : "bg-line";
  const fill = inverse ? "bg-[#79c9b4]" : "bg-[var(--accent)]";
  const text = inverse ? "text-white/50" : "text-faint";

  return (
    <div className={className}>
      <div className={`relative h-1.5 w-full overflow-hidden rounded-full ${rail}`}>
        <div className={`motion-fill h-full rounded-full ${fill}`} style={{ width: `${held}%` }} />
        {gates.map((gate) => {
          const at = Math.min(100, (gate.hours / ceiling) * 100);
          return (
            <span
              key={gate.label}
              className={`absolute top-0 h-full w-px ${inverse ? "bg-white/45" : "bg-[#8ba49c]"}`}
              style={{ left: `${at}%` }}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <div className={`mt-1.5 flex items-center justify-between text-[9px] uppercase tracking-wide ${text}`}>
        <span className="flex items-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: samples }, (_, index) => (
            <span
              key={index}
              className={`motion-fade h-1.5 w-1.5 rounded-full ${fill}`}
              style={{ "--motion-delay": `${index * 0.07}s` } as CSSProperties}
            />
          ))}
        </span>
        <span>
          {hours >= 1 ? `${Math.round(hours)}h held` : "under 1h"} · {sampleCount} sample{sampleCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
