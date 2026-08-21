// Tests for the HTTP surface.
//
// The clock is injected here so the "live" path is testable without the test
// depending on what time it is. That is the same discipline D8 asks of every
// module below this one; the server is just the place where a real clock is
// finally allowed in.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import { createServer, DEMO_T0, parseUntil, wardResponse } from "./index.ts";
import { SPEECH, OBSERVATION } from "../engines/rules/patient.rules.ts";
import type { Event } from "../contracts/index.ts";
import { EventLog } from "../log/store.ts";
import { wardEvents } from "../simulation/ward.ts";

const T = 10_000_000;
const MIN = 60_000;
let seq = 0;

function ev(over: Partial<Event> & { ts: number; room: string }): Event {
  seq += 1;
  return Object.freeze({
    id: `e_${String(seq).padStart(6, "0")}`,
    patientId: "test_patient",
    source: "speech",
    speaker: "patient",
    quote: "",
    code: null,
    observation: "utterance",
    value: null,
    ...over,
  } satisfies Event);
}

const EVENTS: readonly Event[] = Object.freeze([
  ev({ room: "room-01", ts: T, source: "speech", speaker: "patient", observation: SPEECH.symptom, quote: "I am short of breath." }),
  ev({ room: "room-01", ts: T + 10 * MIN, source: "vital", speaker: "unknown", observation: OBSERVATION.toks, value: 5 }),
  ev({ room: "room-02", ts: T + 20 * MIN, source: "speech", speaker: "patient", observation: SPEECH.severeStatement, quote: "I cannot breathe." }),
]);

/** Start on an ephemeral port, run the assertions, always close. */
async function withServer(
  clock: () => number,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer({ events: EVENTS, clock });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function withDemoServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const log = new EventLog();
  for (const input of wardEvents({ startTs: DEMO_T0 })) log.append(input);
  const server = createServer({ events: log.all(), clock: () => DEMO_T0 });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("GET /ward returns ten rooms as JSON", async () => {
  await withServer(() => T + 60 * MIN, async (base) => {
    const response = await fetch(`${base}/ward`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);

    const body = await response.json();
    assert.equal(body.rooms.length, 10);
    assert.equal(body.replayed, false);
    assert.equal(body.until, T + 60 * MIN, "live uses the clock");
  });
});

test("GET /ward reads the clock at request time, not at startup", async () => {
  let now = T - 1;
  await withServer(() => now, async (base) => {
    const before = await (await fetch(`${base}/ward`)).json();
    assert.equal(roomLevel(before, "room-01"), "green", "nothing has happened yet");

    now = T + 30 * MIN;
    const after = await (await fetch(`${base}/ward`)).json();
    assert.equal(roomLevel(after, "room-01"), "red-urgent", "same server, later clock");
  });
});

test("GET /ward?until= replays to that timestamp", async () => {
  // A clock far in the future must not affect an explicit until.
  await withServer(() => T + 999 * MIN, async (base) => {
    const early = await (await fetch(`${base}/ward?until=${T}`)).json();
    assert.equal(early.replayed, true);
    assert.equal(early.until, T);
    assert.equal(roomLevel(early, "room-01"), "yellow");
    assert.equal(roomLevel(early, "room-02"), "green", "the severe statement is still in the future");

    const late = await (await fetch(`${base}/ward?until=${T + 20 * MIN}`)).json();
    assert.equal(roomLevel(late, "room-01"), "red-urgent");
    assert.equal(roomLevel(late, "room-02"), "red-emergency");
  });
});

test("scrubbing backwards and forwards returns identical payloads", async () => {
  await withServer(() => T, async (base) => {
    const first = await (await fetch(`${base}/ward?until=${T + 10 * MIN}`)).text();
    await fetch(`${base}/ward?until=${T + 20 * MIN}`);
    const again = await (await fetch(`${base}/ward?until=${T + 10 * MIN}`)).text();
    assert.equal(first, again, "the scrub must be reversible, byte for byte");
  });
});

test("until=0 is a valid moment, not a missing one", async () => {
  await withServer(() => T + 999 * MIN, async (base) => {
    const body = await (await fetch(`${base}/ward?until=0`)).json();
    assert.equal(body.replayed, true);
    assert.equal(body.until, 0);
    assert.ok(body.rooms.every((r: { patient: { level: string } }) => r.patient.level === "green"));
  });
});

test("a bad until is rejected rather than quietly treated as now", async () => {
  await withServer(() => T, async (base) => {
    for (const bad of ["abc", "-1", "1.5", "NaN"]) {
      const response = await fetch(`${base}/ward?until=${bad}`);
      assert.equal(response.status, 400, `until=${bad} should be a 400`);
    }
  });
});

test("unknown routes and non-GET methods are refused", async () => {
  await withServer(() => T, async (base) => {
    assert.equal((await fetch(`${base}/rooms`)).status, 404);
    assert.equal((await fetch(`${base}/ward`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  });
});

test("the payload reports how many events it was built from", async () => {
  await withServer(() => T, async (base) => {
    const all = await (await fetch(`${base}/ward?until=${T + 999 * MIN}`)).json();
    assert.equal(all.generated_from_events, EVENTS.length);

    const none = await (await fetch(`${base}/ward?until=0`)).json();
    assert.equal(none.generated_from_events, 0);
  });
});

test("evidence on a card carries the quote, speaker and timestamp", async () => {
  await withServer(() => T + 60 * MIN, async (base) => {
    const body = await (await fetch(`${base}/ward`)).json();
    const room = body.rooms.find((r: { room: string }) => r.room === "room-01");
    const [evidence] = room.patient.evidence;

    assert.equal(evidence.quote, "I am short of breath.");
    assert.equal(evidence.speaker, "patient");
    assert.equal(evidence.ts, T);
    assert.ok(evidence.id.startsWith("e_"), "the id survives for click-through");
  });
});

test("parseUntil distinguishes absent from invalid", () => {
  assert.equal(parseUntil(null), undefined);
  assert.equal(parseUntil(""), undefined);
  assert.equal(parseUntil("0"), 0);
  assert.equal(parseUntil("123"), 123);
  assert.equal(parseUntil("-1"), null);
  assert.equal(parseUntil("1.5"), null);
  assert.equal(parseUntil("later"), null);
});

test("wardResponse is the same shape the endpoint serves", () => {
  const built = wardResponse(EVENTS, T + 20 * MIN, true);
  assert.equal(built.rooms.length, 10);
  assert.equal(built.until, T + 20 * MIN);
  assert.equal(built.replayed, true);
});

test("recorded demo run is isolated, retry-safe, and earns the exact causal ladder", async () => {
  await withDemoServer(async (base) => {
    const createdResponse = await fetch(`${base}/api/demo/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "elena_petrova", mode: "recorded" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    const runId = created.runId as string;

    let state = await (await fetch(`${base}/api/demo/runs/${runId}`)).json();
    assert.equal(state.status, "ready");
    assert.equal(state.priority.level, "GREEN");
    assert.equal(state.events.filter((event: Event) => event.observation === "utterance").length, 4);
    assert.equal(state.events.filter((event: Event) => event.observation === "reported_symptom").length, 2);
    assert.ok(state.events.every((event: Event) => event.correlationId === runId));
    assert.ok(state.events.every((event: Event) => !event.quote.includes("9/10")), "acute cached conversation must not contaminate the subtle fallback");

    const expected = [
      { level: "GREEN", rank: 3, agreement: 0, persistenceHours: 0 },
      { level: "WATCH", rank: 1, agreement: 1, persistenceHours: 1 },
      { level: "PERSISTING_CONCERN", rank: 1, agreement: 2, persistenceHours: 2 },
      { level: "HIGH", rank: 1, agreement: 3, persistenceHours: 4 },
    ];

    for (let step = 0; step < expected.length; step += 1) {
      const monitor = await fetch(`${base}/api/demo/runs/${runId}/monitor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStep: step }),
      });
      assert.equal(monitor.status, 201);
      state = await (await fetch(`${base}/api/demo/runs/${runId}`)).json();
      assert.equal(state.monitorStep, step + 1);
      assert.equal(state.priority.level, expected[step]!.level);
      assert.equal(state.priority.rank, expected[step]!.rank);
      assert.equal(state.trends.agreementCount, expected[step]!.agreement);
      assert.equal(state.trends.persistenceMs / 3_600_000, expected[step]!.persistenceHours);

      if (step === 0) {
        const before = state.events.length;
        const duplicate = await fetch(`${base}/api/demo/runs/${runId}/monitor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedStep: 0 }),
        });
        assert.equal(duplicate.status, 200);
        assert.equal((await duplicate.json()).duplicate, true);
        const after = await (await fetch(`${base}/api/demo/runs/${runId}`)).json();
        assert.equal(after.events.length, before, "retry must not append a second device reading");
      }
    }

    const monitorEvents = state.events.filter((event: Event) => event.source === "vital");
    assert.equal(monitorEvents.length, 16);
    assert.ok(monitorEvents.every((event: Event) => event.correlationId === runId));
    const causalSignals = state.trends.signals
      .filter((signal: { concerning: boolean }) => signal.concerning)
      .map((signal: { observation: string }) => signal.observation)
      .sort();
    assert.deepEqual(causalSignals, ["respiratory_rate", "spo2", "systolic_bp"]);
    assert.ok(!causalSignals.includes("heart_rate"), "HR remains visible context, not invented evidence against Elena's real baseline");

    const priorityEvent = [...state.events].reverse().find((event: Event) => event.observation === "priority_changed" && event.value === "HIGH");
    const notification = state.events.find((event: Event) => event.observation === "notification_created");
    assert.ok(priorityEvent);
    assert.ok(notification);
    assert.deepEqual(notification.causedByEventIds, [priorityEvent.id], "notification must descend from the persisted priority transition");
    assert.equal(state.queue[0].patientId, "elena_petrova");
    assert.equal(state.proposals.length, 1);

    const proposal = state.proposals[0];
    const decisionResponse = await fetch(`${base}/api/demo/runs/${runId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, approved: true, note: "Reassess at bedside now." }),
    });
    assert.equal(decisionResponse.status, 200);
    state = await (await fetch(`${base}/api/demo/runs/${runId}`)).json();
    const action = state.events.find((event: Event) => event.value === "approved");
    assert.ok(action, "human approval must append an action event to this run");
    assert.equal(action.correlationId, runId);
    assert.deepEqual(action.causedByEventIds, proposal.evidenceEventIds);
    assert.equal(state.proposals[0].status, "approved");
  });
});

function roomLevel(body: { rooms: { room: string; patient: { level: string } }[] }, room: string): string {
  return body.rooms.find((r) => r.room === room)!.patient.level;
}
