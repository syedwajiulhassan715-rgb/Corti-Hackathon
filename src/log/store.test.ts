// Tests for the append-only event log. Written before store.ts.
//
// The log is the sole interface (D5) and must be replayable exactly, so the
// properties under test are ordering, id uniqueness, and durability of the
// JSONL mirror. No test may call Date.now() — ts is always supplied (D8).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { EventLog } from "./store.ts";
import type { EventInput } from "../contracts/index.ts";

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

function tmpPath(name: string): string {
  const p = join(tmpdir(), `echo-log-${name}-${process.pid}.jsonl`);
  if (existsSync(p)) rmSync(p);
  return p;
}

test("fixture is the 12 events the suite expects", () => {
  const events = fixtureEvents();
  assert.equal(events.length, 12);
  assert.equal(events[0].ts, 1000);
  assert.equal(events[10].ts, 11000);
  assert.equal(events[11].ts, 11001, "last two events must be 1 ms apart");
});

test("append returns an EventId", () => {
  const log = new EventLog();
  const id = log.append(fixtureEvents()[0]);
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
});

test("append preserves insertion order", () => {
  const log = loaded();
  const all = log.all();
  assert.equal(all.length, 12);
  assert.deepEqual(
    all.map((e) => e.observation),
    fixtureEvents().map((e) => e.observation),
  );
  assert.deepEqual(
    all.map((e) => e.ts),
    [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 11001],
  );
});

test("append preserves insertion order even when ts arrives out of order", () => {
  const log = new EventLog();
  const [first, second] = fixtureEvents();
  log.append({ ...second, ts: 9999 });
  log.append({ ...first, ts: 10 });
  assert.deepEqual(
    log.all().map((e) => e.ts),
    [9999, 10],
    "a late-arriving feed event must not be reordered by the store",
  );
});

test("ids are unique across every append, including identical payloads", () => {
  const log = new EventLog();
  const ids: string[] = [];
  for (const e of fixtureEvents()) ids.push(log.append(e));
  const duplicate = fixtureEvents()[0];
  ids.push(log.append(duplicate));
  ids.push(log.append(duplicate));
  assert.equal(ids.length, 14);
  assert.equal(new Set(ids).size, 14, "identical payloads must still get distinct ids");
});

test("the id append returns is the id stored on the event", () => {
  const log = new EventLog();
  const id = log.append(fixtureEvents()[3]);
  assert.equal(log.all()[0].id, id);
  assert.equal(log.byId(id)?.observation, "order_chest_xray");
});

test("stored events are frozen — the log cannot be mutated through a read", () => {
  const log = loaded();
  const event = log.all()[0];
  assert.throws(() => {
    (event as { observation: string }).observation = "tampered";
  });
  assert.equal(log.all()[0].observation, "dyspnoea");
});

test("all() returns a fresh array — mutating it does not truncate the log", () => {
  const log = loaded();
  log.all().length = 0;
  assert.equal(log.all().length, 12);
});

test("the JSONL mirror holds one line per event, in append order", () => {
  const path = tmpPath("mirror");
  const log = new EventLog({ path });
  for (const e of fixtureEvents()) log.append(e);

  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l !== "");
  assert.equal(lines.length, 12);
  assert.deepEqual(
    lines.map((l) => JSON.parse(l).ts),
    log.all().map((e) => e.ts),
  );
  assert.equal(JSON.parse(lines[0]).id, log.all()[0].id);
  rmSync(path);
});

test("a mirrored log reloads to exactly the same events", () => {
  const path = tmpPath("reload");
  const first = new EventLog({ path });
  for (const e of fixtureEvents()) first.append(e);

  const second = EventLog.load(path);
  assert.deepEqual(second.all(), first.all());
  rmSync(path);
});

test("a reloaded log keeps issuing unique ids", () => {
  const path = tmpPath("reload-ids");
  const first = new EventLog({ path });
  const before = fixtureEvents().map((e) => first.append(e));

  const second = EventLog.load(path);
  const after = second.append(fixtureEvents()[0]);
  assert.ok(!before.includes(after), "a reloaded log must not reissue an id it already used");
  assert.equal(second.all().length, 13);
  rmSync(path);
});

test("the log is append-only — there is no mutating method on the surface", () => {
  const log = loaded();
  for (const forbidden of ["delete", "remove", "update", "set", "clear", "truncate"]) {
    assert.equal(
      (log as unknown as Record<string, unknown>)[forbidden],
      undefined,
      `EventLog must not expose ${forbidden}()`,
    );
  }
});
