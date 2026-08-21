"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The twin clock.
 *
 * A digital twin is only worth the name if you can see it being fed. This strip
 * is the proof: the number of events the model was folded from, the simulated
 * moment it was folded TO, and a counter of how long this drawing has been
 * standing on that fold. When the scrubber moves or a round plays, the event
 * count changes and the age resets to zero in front of you.
 *
 * `generated_from_events` is the server's own count -- not a number invented
 * here. Nothing on this strip is decorative.
 *
 * The clock is the one place requestAnimationFrame earns its keep: it ticks
 * about four times a second and touches no layout, rather than a setInterval
 * that keeps firing when the tab is hidden.
 */
export function TwinTelemetry({
  events,
  until,
  beds,
  live,
}: {
  events: number;
  until: number;
  beds: number;
  live: boolean;
}) {
  const [age, setAge] = useState(0);
  // Time formatting is locale- and zone-dependent, so it cannot run during the
  // static export or the first client render without risking a hydration
  // mismatch. It appears one frame later instead.
  const [mounted, setMounted] = useState(false);
  const since = useRef(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    since.current = performance.now();
    setAge(0);
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      if (time - last > 240) {
        last = time;
        setAge((time - since.current) / 1000);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [events, until]);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line bg-[#f6f8f7] px-4 py-2 text-[10px] text-dim">
      <span className="flex items-center gap-2 font-semibold uppercase tracking-[0.13em] text-[var(--accent)]">
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
          <path className={live ? "twin-sweep" : undefined} d="M6 6 L6 1" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
        Twin model
      </span>
      <Field label="folded from" value={`${events} events`} />
      <Field label="ward moment" value={mounted ? new Date(until).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "--"} />
      <Field label="beds tracked" value={String(beds)} />
      <Field label="model age" value={`${age.toFixed(1)}s`} />
      <span className="ml-auto text-faint">Floor geometry simulated · patient state from the event log</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="uppercase tracking-[0.1em] text-faint">{label}</span>
      <b className="twin-tabular font-semibold text-ink">{value}</b>
    </span>
  );
}
