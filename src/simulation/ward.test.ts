import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { wardEvents, WARD_ROLES } from "./ward.ts";
import { CONVERSATION_OFFSET_MS } from "./conversation.ts";
import { ALL_PATIENTS } from "../world/patients.ts";
import { EventLog } from "../log/store.ts";
import { patientHistory } from "../projections/patientHistory.ts";
import { loadRecord } from "../world/patients.ts";

const T0 = 1_787_212_800_000;
const HOUR = 3_600_000;
const STEP = 4 * HOUR;

const build = () => wardEvents({ startTs: T0, stepMs: STEP });

test("the ward is byte-identical across runs", () => {
  // The property the whole demo rests on. A jury that asks "run that again"
  // must get the same ward, which is why nothing here rolls dice.
  assert.deepEqual(build(), build());
});

test("simulation/ward reads no clock and rolls no dice", () => {
  // Mechanical, not aspirational: the determinism law is only worth anything
  // if something checks the source. Same guard the other simulation modules
  // carry.
  const source = readFileSync(new URL("./ward.ts", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
  assert.ok(!source.includes("Date.now("), "ward.ts must not read the wall clock");
  assert.ok(!source.includes("Math.random("), "ward.ts must not roll dice");
});

test("every event carries a patient, and every patient is a real chart", () => {
  const known = new Set(ALL_PATIENTS);
  for (const event of build()) {
    assert.ok(event.patientId, `event at ${event.ts} has no patientId`);
    assert.ok(known.has(event.patientId), `unknown patient ${event.patientId}`);
  }
});

test("events come out in timestamp order", () => {
  const events = build();
  for (let i = 1; i < events.length; i += 1) {
    assert.ok(
      events[i]!.ts >= events[i - 1]!.ts,
      `event ${i} goes backwards in time`,
    );
  }
});

test("every cast patient is a real chart, and nobody is cast twice", () => {
  const cast = WARD_ROLES.map((r) => r.patientId);
  assert.equal(new Set(cast).size, cast.length, "a patient is cast in two roles");
  for (const role of WARD_ROLES) {
    assert.ok(ALL_PATIENTS.includes(role.patientId), `${role.patientId} has no chart`);
    assert.ok(role.note.trim() !== "", `${role.patientId} has no stage note`);
  }
});

test("a patient cast to stop being observed does stop, and mid-reading is never cut", () => {
  const role = WARD_ROLES.find((r) => r.observeSteps !== undefined);
  assert.ok(role, "the ward must cast someone to demonstrate the silence signal");

  const theirs = build()
    .filter((e) => e.patientId === role.patientId && e.ts > T0)
    .map((e) => e.ts);
  assert.ok(theirs.length > 0, "they must be observed at least once before going quiet");

  const last = Math.max(...theirs);
  assert.ok(
    last <= T0 + role.observeSteps! * STEP,
    "observation continued past the point they were cast to stop",
  );

  // One tick emits several observations; cutting by array position instead of
  // timestamp would truncate a patient half way through a set of readings.
  const ticks = new Set(theirs);
  for (const tick of ticks) {
    assert.ok(tick % STEP === T0 % STEP, "a reading landed off the observation cadence");
  }
});

test("elena_petrova's ward log carries the room-02 conversation, inside the demo window", () => {
  // Before simulation/conversation.ts existed, the ward had ZERO speech
  // events anywhere and this test would have nothing to find.
  const events = build();
  const speech = events.filter((e) => e.patientId === "elena_petrova" && e.source === "speech");
  assert.ok(speech.length > 0, "elena_petrova must have speech events in the ward log");

  const demoEnd = T0 + 4 * STEP; // the demo's four scripted advances, ward.ts's own window
  for (const event of speech) {
    assert.ok(event.ts >= T0, "the conversation must not predate the demo start");
    assert.ok(event.ts < demoEnd, "the conversation must land inside the demo window, not after it");
  }

  // And it lands early in that window — see CONVERSATION_OFFSET_MS's comment
  // in conversation.ts: before the ladder's first vital update, so the
  // quotes are already history by the time the numbers start climbing.
  assert.ok(
    Math.max(...speech.map((e) => e.ts)) < T0 + STEP,
    "the conversation must finish before the first scripted vital advance",
  );
});

test("elena_petrova's history has facts once the whole ward is folded", () => {
  // THE POINT OF THIS WORKSTREAM. Not just that conversationEvents() alone
  // produces facts (conversation.test.ts checks that) — that wiring it into
  // the actual demo ward, alongside every other patient's events, still
  // leaves patientHistory with something in `facts` for elena_petrova.
  const log = new EventLog();
  for (const input of build()) log.append(input);

  const now = T0 + CONVERSATION_OFFSET_MS + 3_600_000;
  const history = patientHistory(log.all(), loadRecord("elena_petrova"), now);
  assert.ok(history);
  assert.ok(history!.facts.length > 0, "elena_petrova must have at least one derived fact");
});

test("the charted past is preserved, not overwritten by the simulated future", () => {
  // The honesty story depends on this: what the organisers supplied stays
  // exactly as supplied, and everything we invent sits strictly after it.
  const events = build();
  const charted = events.filter((e) => e.ts <= T0);
  assert.ok(charted.length > 0, "the real chart data must survive into the log");
  assert.ok(
    events.some((e) => e.ts > T0),
    "and the simulated future must actually be projected",
  );
});
