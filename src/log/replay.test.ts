// Tests for replay(until). Written before replay.ts.
//
// The invariant under test is the one CONTRACTS.md states: replay to T
// reproduces state at T exactly. That means the slice is inclusive of T,
// exclusive of everything after it, and identical every time it is asked for.
// replay takes `until` as an argument and never reads a clock (D8).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EventLog } from "./store.ts";
import type { EventInput } from "../contracts/index.ts";
import { replay } from "./replay.ts";

const FIXTURE = join(import.meta.dirname, "../../fixtures/events/log12.jsonl");

function fixtureEvents(): EventInput[] {
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const { id: _ignored, ...rest } = JSON.parse(line);
      return rest as EventInput;
    });
}

function loaded(): EventLog {
  const log = new EventLog();
  for (const e of fixtureEvents()) log.append(e);
  return log;
}

test("replay(T) is inclusive of an event exactly at T", () => {
  const log = loaded();
  const slice = replay(log, 5000);
  assert.equal(slice.length, 5);
  assert.equal(slice.at(-1)?.ts, 5000);
  assert.equal(slice.at(-1)?.observation, "pain_score");
});

test("replay(T) excludes an event at T+1", () => {
  const log = loaded();
  const at = replay(log, 11000);
  const after = replay(log, 11001);

  assert.equal(at.length, 11, "the event at 11001 must not be in the slice at 11000");
  assert.ok(!at.some((e) => e.ts === 11001));
  assert.equal(at.at(-1)?.observation, "crp");

  assert.equal(after.length, 12, "one millisecond later it must be in");
  assert.equal(after.at(-1)?.observation, "task_closed");
});

test("replay(T) reproduces the same slice twice", () => {
  const log = loaded();
  const first = replay(log, 7000);
  const second = replay(log, 7000);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((e) => e.id),
    second.map((e) => e.id),
  );
  assert.notEqual(first, second, "each call returns its own array, not a shared one");
});

test("replay is unaffected by appends that happen after T", () => {
  const log = loaded();
  const before = replay(log, 7000);
  log.append({ ...fixtureEvents()[0], ts: 12000 });
  const after = replay(log, 7000);
  assert.deepEqual(after, before, "a later append must not change the slice at T");
});

test("replay walks the whole log at the last timestamp", () => {
  const log = loaded();
  assert.equal(replay(log, 11001).length, 12);
  assert.equal(replay(log, 999999).length, 12);
});

test("replay before the first event is empty", () => {
  const log = loaded();
  assert.deepEqual(replay(log, 999), []);
  assert.deepEqual(replay(log, 0), []);
});

test("replay keeps append order when two events share a timestamp", () => {
  const log = new EventLog();
  const [a, b, c] = fixtureEvents();
  log.append({ ...a, ts: 500 });
  log.append({ ...b, ts: 500 });
  log.append({ ...c, ts: 500 });
  assert.deepEqual(
    replay(log, 500).map((e) => e.observation),
    [a.observation, b.observation, c.observation],
  );
});

test("replay filters by ts, not by position, when a feed event arrives late", () => {
  const log = new EventLog();
  const [a, b] = fixtureEvents();
  log.append({ ...a, ts: 8000 });
  log.append({ ...b, ts: 2000 });
  const slice = replay(log, 5000);
  assert.equal(slice.length, 1, "only the event whose ts is <= T belongs in the slice");
  assert.equal(slice[0].ts, 2000);
});

test("the slice is frozen — a projection cannot mutate history", () => {
  const log = loaded();
  const slice = replay(log, 5000);
  assert.throws(() => {
    (slice[0] as { observation: string }).observation = "tampered";
  });
  assert.equal(replay(log, 5000)[0].observation, "dyspnoea");
});

test("replay never consults a clock — a slice at T is stable across real time", async () => {
  const log = loaded();
  const first = replay(log, 6000);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(replay(log, 6000), first);
});
