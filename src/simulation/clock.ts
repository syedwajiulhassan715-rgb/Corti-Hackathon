// Simulation: a deterministic clock for the ward.
//
// INJECTED, NEVER READ. This module must not call Date.now() — the
// architecture law reserves the wall clock for main.ts and server/index.ts
// alone (see CLAUDE.md, "Architecture law"). Every function here takes the
// real-world timestamp it needs as an argument, `realNowMs`, supplied by the
// caller. Given the same starting state and the same sequence of calls with
// the same arguments, this module always produces the same simulated time —
// that is what "replay to T reproduces T exactly" requires of a clock, and
// it is also what makes the clock itself testable without mocking a global.
//
// TWO WAYS TO MOVE TIME FORWARD, deliberately kept separate:
//   - advance / advanceHours / advanceDays: an explicit scrub. This is what
//     the acceptance test drives ("advance the simulation three times") and
//     what a demo operator clicks. It never depends on the real clock.
//   - start / resume + tick: real-time playback, where simulated time moves
//     at `speed` times real time while the clock is running. `tick` is the
//     only function that reads elapsed real time, and it does so from the
//     `realNowMs` argument, never from Date.now().
// A caller may use either or both; they compose because both only ever
// touch `simulatedMs`.

import type { Millis } from "../contracts/index.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The multipliers the ward UI offers. Not enforced by the type, but this
 * is the documented menu — see the header comment on speed. */
export const SPEEDS = Object.freeze([1, 10, 60, 600] as const);
export type Speed = (typeof SPEEDS)[number];

export interface ClockState {
  /** The simulated moment, in the same units as a real Millis timestamp. */
  readonly simulatedMs: Millis;
  readonly running: boolean;
  /** How many simulated ms pass per real ms while running. */
  readonly speed: number;
  /**
   * The real-clock reading `tick` last saw. Null whenever the clock is not
   * running — there is nothing to measure elapsed time against, and a stale
   * value here would silently fold "time while paused" into the next tick.
   */
  readonly lastRealMs: Millis | null;
}

/** A fresh, paused clock. `startSimulatedMs` is usually the earliest event
 * in the log, so simulated time starts where the charted history ends. */
export function createClock(startSimulatedMs: Millis = 0): ClockState {
  return Object.freeze({
    simulatedMs: startSimulatedMs,
    running: false,
    speed: 1,
    lastRealMs: null,
  });
}

/** Begin (or resume) real-time playback. Idempotent: starting an already-
 * running clock just re-anchors `lastRealMs` to the given moment, which is
 * a no-op in simulated time as long as the caller ticks immediately after. */
export function start(state: ClockState, realNowMs: Millis, speed: number = state.speed): ClockState {
  return Object.freeze({ ...state, running: true, speed, lastRealMs: realNowMs });
}

/** Alias for `start` with the clock's current speed, kept as a separate
 * name because "resume after pause" and "start for the first time" read
 * differently on a call site even though the state transition is the same. */
export function resume(state: ClockState, realNowMs: Millis): ClockState {
  return start(state, realNowMs, state.speed);
}

/** Freeze simulated time. Folds in whatever elapsed since the last tick
 * first, so the pause point is exact rather than rounded to the last tick. */
export function pause(state: ClockState, realNowMs: Millis): ClockState {
  const ticked = tick(state, realNowMs);
  return Object.freeze({ ...ticked, running: false, lastRealMs: null });
}

/** Change the playback speed without losing or duplicating elapsed time:
 * whatever ran at the old speed is folded in before the new speed applies. */
export function setSpeed(state: ClockState, speed: number, realNowMs: Millis): ClockState {
  const ticked = tick(state, realNowMs);
  return Object.freeze({ ...ticked, speed, lastRealMs: ticked.running ? realNowMs : ticked.lastRealMs });
}

/** Back to a fresh, paused clock at the given simulated moment. Speed resets
 * to 1x — a demo restart should not inherit the previous run's fast-forward. */
export function reset(state: ClockState, startSimulatedMs: Millis = 0): ClockState {
  return createClock(startSimulatedMs);
}

/**
 * Advance simulated time directly, independent of playback state. This is
 * the primitive `advanceHours` and `advanceDays` are built from, and the one
 * the acceptance test's "advance the simulation three times" uses.
 */
export function advance(state: ClockState, ms: Millis): ClockState {
  return Object.freeze({ ...state, simulatedMs: state.simulatedMs + ms });
}

export function advanceHours(state: ClockState, hours: number): ClockState {
  return advance(state, hours * HOUR);
}

export function advanceDays(state: ClockState, days: number): ClockState {
  return advance(state, days * DAY);
}

/**
 * Fold real-time playback into simulated time, as of `realNowMs`.
 *
 * A no-op while paused (`running` false) or before the clock has ever been
 * started (`lastRealMs` null) — there is no elapsed interval to apply yet.
 * `realNowMs` before `lastRealMs` (a caller passing a stale timestamp) is
 * clamped to zero elapsed rather than moving simulated time backwards: the
 * simulated clock only ever runs forward.
 */
export function tick(state: ClockState, realNowMs: Millis): ClockState {
  if (!state.running || state.lastRealMs === null) return state;

  const elapsedRealMs = Math.max(0, realNowMs - state.lastRealMs);
  return Object.freeze({
    ...state,
    simulatedMs: state.simulatedMs + elapsedRealMs * state.speed,
    lastRealMs: realNowMs,
  });
}
