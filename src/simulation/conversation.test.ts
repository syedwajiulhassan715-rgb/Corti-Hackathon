import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  conversationEvents,
  CONVERSATION_PATIENT,
  CONVERSATION_ROOM,
} from "./conversation.ts";
import { EventLog } from "../log/store.ts";
import { patientHistory } from "../projections/patientHistory.ts";
import { loadRecord } from "../world/patients.ts";

const T0 = 1_787_212_800_000;

const build = () => conversationEvents({ startTs: T0 });

test("conversationEvents is byte-identical across runs", () => {
  // The property the whole demo rests on. A jury that asks "run that again"
  // must get the same conversation, which is why nothing here rolls dice.
  assert.deepEqual(build(), build());
});

test("simulation/conversation reads no clock and rolls no dice", () => {
  // Mechanical, not aspirational: copied from ward.test.ts's own check.
  const source = readFileSync(new URL("./conversation.ts", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
  assert.ok(!source.includes("Date.now("), "conversation.ts must not read the wall clock");
  assert.ok(!source.includes("Math.random("), "conversation.ts must not roll dice");
});

test("runs with no credentials and no network at all", () => {
  // conversationEvents takes no fetch and no credentials parameter in the
  // first place — there is nowhere for a network call to come from. This
  // test exists so that claim has an assertion behind it: build() must not
  // throw, on a machine with no Corti reachable.
  assert.doesNotThrow(build);
});

test("every event carries elena_petrova in room-02", () => {
  const events = build();
  assert.ok(events.length > 0, "the recording must produce events");
  for (const event of events) {
    assert.equal(event.patientId, CONVERSATION_PATIENT);
    assert.equal(event.room, CONVERSATION_ROOM);
  }
});

test("roles were actually assigned — not every speaker is unknown", () => {
  const events = build();
  const utterances = events.filter((e) => e.observation === "utterance");
  assert.ok(utterances.length > 0, "the transcript must produce utterance events");
  assert.ok(
    utterances.some((e) => e.speaker === "clinician"),
    "the clinician's opening self-identification must resolve slot 0",
  );
  assert.ok(
    utterances.some((e) => e.speaker === "patient"),
    "the patient side must resolve too",
  );
});

test("at least one candidate survives grounding as a derived fact", () => {
  const events = build();
  const derived = events.filter((e) => e.source === "speech" && e.observation !== "utterance");
  assert.ok(derived.length > 0, "grounding must produce at least one fact from this recording");
  for (const fact of derived) {
    // Product law: nothing enters state without a quote, speaker and
    // timestamp, and a derived fact's quote must be words the patient or
    // clinician actually said, not an invented paraphrase.
    assert.notEqual(fact.quote.trim(), "");
    assert.notEqual(fact.speaker, "unknown");
    assert.ok(Number.isFinite(fact.ts));
  }
});

test("a known symptom (new chest pain) is among the grounded facts, attributed to the patient", () => {
  const events = build();
  const symptom = events.find(
    (e) => e.observation === "symptom" && e.quote.toLowerCase().includes("sharp pain"),
  );
  assert.ok(symptom, "the patient's chest pain report must ground as a symptom");
  assert.equal(symptom!.speaker, "patient");
});

test("timestamps derive from startTs plus the recording's own offsets, deterministically", () => {
  const events = build();
  for (const event of events) {
    assert.ok(event.ts >= T0, "nothing in the recording precedes startTs");
    assert.ok(event.ts <= T0 + 200_000, "the ~109s recording must not spill far past its own length");
  }

  const shifted = conversationEvents({ startTs: T0 + 1000 });
  assert.deepEqual(
    shifted.map((e) => e.ts - 1000),
    events.map((e) => e.ts),
    "shifting startTs shifts every event by exactly that much, and nothing else changes",
  );
});

test("events come out in timestamp order", () => {
  const events = build();
  for (let i = 1; i < events.length; i += 1) {
    assert.ok(events[i]!.ts >= events[i - 1]!.ts, `event ${i} goes backwards in time`);
  }
});

test("folded through the real log and patientHistory, elena_petrova has facts", () => {
  // THE POINT OF THIS FILE. Before this module existed, patientHistory's
  // `facts` came back empty for every patient because no speech events
  // existed anywhere in the ward. This is the direct check that the gap is
  // closed for the one conversation we have.
  const log = new EventLog();
  for (const input of build()) log.append(input);

  const record = loadRecord(CONVERSATION_PATIENT);
  const history = patientHistory(log.all(), record, T0 + 3_600_000);
  assert.ok(history);
  assert.ok(history!.facts.length > 0, "elena_petrova must have at least one derived fact");
  for (const fact of history!.facts) {
    assert.notEqual((fact.quote ?? "").trim(), "");
    assert.notEqual(fact.speaker, "unknown");
  }
});
