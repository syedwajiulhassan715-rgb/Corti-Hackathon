// Tests for the simulation clock. Written before wiring it into main.ts.
//
// What matters most: the clock never reads Date.now() itself (the
// architecture law reserves that for main.ts/server/index.ts), and the same
// sequence of calls with the same arguments always produces the same
// simulated time — otherwise a replayed demo would not replay.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createClock,
  start,
  resume,
  pause,
  reset,
  advance,
  advanceHours,
  advanceDays,
  setSpeed,
  tick,
  SPEEDS,
} from "./clock.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// -------------------------------------------------------- the law itself

test("clock.ts never calls Date.now — the wall clock is always injected", () => {
  const source = readFileSync(new URL("./clock.ts", import.meta.url), "utf8");
  // The header comment talks ABOUT Date.now() to explain why it is absent;
  // only a non-comment line actually calling it would violate the law.
  const codeLines = source.split("\n").filter((line) => !line.trim().startsWith("//"));
  const offender = codeLines.find((line) => line.includes("Date.now("));
  assert.equal(offender, undefined, "clock.ts must not read the wall clock internally");
});

// ---------------------------------------------------------- determinism

test("the same sequence of calls with the same arguments is byte-identical every time", () => {
  const run = () => {
    let s = createClock(1_000_000);
    s = start(s, 2_000_000, 60);
    s = tick(s, 2_000_500);
    s = advanceHours(s, 1);
    s = pause(s, 2_001_000);
    return s;
  };

  const a = run();
  const b = run();
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("advancing twice by an hour equals advancing once by two hours", () => {
  const base = createClock(0);
  const twice = advance(advance(base, HOUR), HOUR);
  const once = advance(base, 2 * HOUR);
  assert.equal(twice.simulatedMs, once.simulatedMs);
});

test("advanceHours and advanceDays are advance in disguise", () => {
  const base = createClock(0);
  assert.equal(advanceHours(base, 3).simulatedMs, advance(base, 3 * HOUR).simulatedMs);
  assert.equal(advanceDays(base, 2).simulatedMs, advance(base, 2 * DAY).simulatedMs);
});

// -------------------------------------------------------------- ticking

test("a paused clock does not advance on tick", () => {
  const s = createClock(0);
  assert.equal(tick(s, 999_999).simulatedMs, 0);
});

test("a running clock advances simulated time by elapsed real time times speed", () => {
  let s = createClock(0);
  s = start(s, 0, 10);
  s = tick(s, 1000); // 1000ms real at 10x -> 10,000ms simulated
  assert.equal(s.simulatedMs, 10_000);

  s = tick(s, 3000); // +2000ms real at 10x -> +20,000ms simulated
  assert.equal(s.simulatedMs, 30_000);
});

test("every documented speed multiplier scales tick correctly", () => {
  for (const speed of SPEEDS) {
    let s = createClock(0);
    s = start(s, 0, speed);
    s = tick(s, 1000);
    assert.equal(s.simulatedMs, 1000 * speed, `speed ${speed}x`);
  }
});

test("pause freezes simulated time against further ticks", () => {
  let s = createClock(0);
  s = start(s, 0, 60);
  s = tick(s, 1000);
  s = pause(s, 2000); // folds in the second 1000ms first, then freezes
  const frozenAt = s.simulatedMs;
  assert.equal(frozenAt, 2000 * 60);

  s = tick(s, 999_999); // must be a no-op: not running
  assert.equal(s.simulatedMs, frozenAt);
});

test("resume continues from where pause left off, at the same speed", () => {
  let s = createClock(0);
  s = start(s, 0, 10);
  s = tick(s, 1000); // 10,000
  s = pause(s, 1000);
  s = resume(s, 5000); // real-time gap while paused must not count
  s = tick(s, 6000); // +1000ms real at 10x -> +10,000
  assert.equal(s.simulatedMs, 20_000);
});

test("a stale realNowMs before the last tick clamps to zero elapsed, never runs backwards", () => {
  let s = createClock(0);
  s = start(s, 5000, 60);
  s = tick(s, 1000); // earlier than start's anchor
  assert.equal(s.simulatedMs, 0);
  assert.equal(s.lastRealMs, 1000);
});

test("setSpeed folds in elapsed time at the old speed before switching", () => {
  let s = createClock(0);
  s = start(s, 0, 1);
  s = tick(s, 1000); // +1000 at 1x
  s = setSpeed(s, 600, 1000);
  s = tick(s, 1001); // +1ms real at 600x -> +600
  assert.equal(s.simulatedMs, 1000 + 600);
});

// --------------------------------------------------------------- reset

test("reset returns to a fresh, paused clock at the given moment", () => {
  let s = createClock(0);
  s = start(s, 0, 600);
  s = tick(s, 10_000);
  s = reset(s, 42);

  assert.equal(s.simulatedMs, 42);
  assert.equal(s.running, false);
  assert.equal(s.speed, 1);
  assert.equal(s.lastRealMs, null);
});

// --------------------------------------------------------------- purity

test("state objects are frozen — a caller cannot mutate the clock in place", () => {
  const s = createClock(0);
  assert.throws(() => {
    (s as { simulatedMs: number }).simulatedMs = 999;
  });
});
