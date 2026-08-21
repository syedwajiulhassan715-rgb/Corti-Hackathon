// Tests for the workflow agent. THE BOUNDARY is the thing under test more
// than any individual proposal: level/rank must survive untouched, evidence
// must be non-empty, and a Corti failure must degrade rather than crash
// (test law).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DiskCache } from "../corti/cache.ts";
import { approve, propose, reject } from "./proposals.ts";
import type { PatientPriority, PriorityComponent, Staff } from "../contracts/index.ts";
import { ROSTER } from "../world/roster.ts";

const NOW = 1_700_000_000_000;

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "echo-proposals-"));
}

const offline: typeof globalThis.fetch = () => {
  throw new Error("network call attempted in an offline test");
};

function component(overrides: Partial<PriorityComponent> = {}): PriorityComponent {
  return {
    name: "trend",
    explanation: "spo2 is worsening at 88 (-6 from a baseline of 94).",
    points: 10,
    evidenceEventIds: ["evt-1"],
    ...overrides,
  };
}

function priority(overrides: Partial<PatientPriority> = {}): PatientPriority {
  const components = overrides.components ?? [component()];
  return {
    patientId: "elena_petrova",
    level: "HIGH",
    rank: 1,
    score: 10,
    components,
    reasons: components.map((c) => c.explanation),
    withheld: [],
    evidenceEventIds: components.flatMap((c) => c.evidenceEventIds),
    previousLevel: "WATCH",
    lastUpdatedAt: NOW,
    ...overrides,
  };
}

const ROSTER_WITH_EVERYONE_FREE: readonly Staff[] = Object.freeze([
  Object.freeze({ id: "nurse-1", name: "Nurse Free", role: "nurse", available: true }),
  Object.freeze({ id: "doctor-1", name: "Doc Free", role: "doctor", available: true }),
  Object.freeze({ id: "senior-1", name: "Senior Free", role: "senior", available: true }),
]);

const ROSTER_WITH_NOBODY_FREE: readonly Staff[] = Object.freeze([
  Object.freeze({ id: "nurse-1", name: "Nurse Busy", role: "nurse", available: false }),
  Object.freeze({ id: "doctor-1", name: "Doc Busy", role: "doctor", available: false }),
  Object.freeze({ id: "senior-1", name: "Senior Busy", role: "senior", available: false }),
]);

// ------------------------------------------------------------- the boundary

test("the agent never changes level or rank: they are copied verbatim, even for an odd input", async () => {
  // Deliberately odd: CRITICAL with rank 4, which would never happen from a
  // real ward fold (CRITICAL always sorts to rank 1 when it's the only
  // urgent patient) but the agent must not "fix" it — it only quotes.
  const odd = priority({ level: "CRITICAL", rank: 4, score: 999 });
  const [p] = await propose([odd], ROSTER_WITH_EVERYONE_FREE, NOW);
  assert.equal(p.level, "CRITICAL");
  assert.equal(p.rank, 4);
});

test("a GREEN patient with nothing outstanding gets no proposal", async () => {
  const green = priority({ level: "GREEN", components: [], reasons: [], evidenceEventIds: [] });
  const out = await propose([green], ROSTER_WITH_EVERYONE_FREE, NOW);
  assert.deepEqual(out, []);
});

test("a GREEN patient with something outstanding still gets a proposal — proposing work for a well patient is only wrong when there is none", async () => {
  const outstanding = component({ name: "unresolved-tasks", explanation: 'Planned but not documented as done: "repeat bloods".', points: 4 });
  const green = priority({ level: "GREEN", components: [outstanding], reasons: [outstanding.explanation] });
  const [p] = await propose([green], ROSTER_WITH_EVERYONE_FREE, NOW);
  assert.equal(p.kind, "assign");
  assert.equal(p.level, "GREEN");
});

test("a silence-dominant patient gets an observe proposal, regardless of level", async () => {
  const silence = component({ name: "silence", explanation: "No new spo2 reading in 3 hours — overdue.", points: 15, evidenceEventIds: ["evt-silence"] });
  const trend = component({ name: "trend", points: 5 });
  const p1 = priority({ level: "WATCH", components: [silence, trend] });
  const [proposal] = await propose([p1], ROSTER_WITH_EVERYONE_FREE, NOW);
  assert.equal(proposal.kind, "observe");
  assert.deepEqual(proposal.evidenceEventIds, ["evt-silence"]);
});

test("WATCH with only a trend component (no silence, below every gate) gets no proposal — WATCH is free", async () => {
  const watch = priority({ level: "WATCH", components: [component({ name: "trend", points: 5 })] });
  const out = await propose([watch], ROSTER_WITH_EVERYONE_FREE, NOW);
  assert.deepEqual(out, []);
});

test("CRITICAL routes to escalate, HIGH and PERSISTING_CONCERN route to reassess", async () => {
  const critical = priority({ level: "CRITICAL", rank: 1 });
  const high = priority({ level: "HIGH", rank: 2, patientId: "david_kim" });
  const persisting = priority({ level: "PERSISTING_CONCERN", rank: 3, patientId: "aisha_rahman" });
  const out = await propose([critical, high, persisting], ROSTER_WITH_EVERYONE_FREE, NOW);
  const byPatient = Object.fromEntries(out.map((p) => [p.patientId, p]));
  assert.equal(byPatient["elena_petrova"]?.kind, "escalate");
  assert.equal(byPatient["david_kim"]?.kind, "reassess");
  assert.equal(byPatient["aisha_rahman"]?.kind, "reassess");
});

test("a proposal with no evidence is never emitted", async () => {
  // Constructed to be pathological: a HIGH level whose priority carries no
  // evidence at all. Real engine output never does this (D2 forbids it) but
  // the agent must not trust that — it checks.
  const noEvidence = priority({ level: "HIGH", evidenceEventIds: [], components: [component({ evidenceEventIds: [] })] });
  const out = await propose([noEvidence], ROSTER_WITH_EVERYONE_FREE, NOW);
  assert.deepEqual(out, []);
});

// ------------------------------------------------------------- assignment

test("nobody available for the required role: the proposal is still emitted, assignee null, and the summary says so", async () => {
  const [p] = await propose([priority({ level: "CRITICAL" })], ROSTER_WITH_NOBODY_FREE, NOW);
  assert.equal(p.assignee, null);
  assert.match(p.summary, /nobody free|nobody available|manual assignment/i);
});

test("an available person of the suitable role is assigned", async () => {
  const [p] = await propose([priority({ level: "CRITICAL" })], ROSTER_WITH_EVERYONE_FREE, NOW);
  assert.equal(p.assignee?.role, "senior");
  assert.equal(p.assignee?.available, true);
});

// -------------------------------------------------------- generation / fallback

test("everything runs offline with a fetch that throws: no cache supplied means an immediate, non-throwing fallback", async () => {
  const [p] = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, { fetch: offline });
  assert.equal(p.generated, false);
  assert.ok(p.rationale.length > 0);
});

test("a cache miss without credentials falls back rather than throwing", async () => {
  const dir = scratch();
  const [p] = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, {
    cache: new DiskCache({ dir }),
    fetch: offline,
  });
  assert.equal(p.generated, false);
  assert.match(p.rationale, /^HIGH \(rank 1, score 10\):/);
  rmSync(dir, { recursive: true });
});

test("a Corti generation failure (fetch throws, credentials present) degrades to the fallback instead of crashing", async () => {
  const dir = scratch();
  const throwingFetch: typeof globalThis.fetch = async () => {
    throw new Error("network down");
  };
  const [p] = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, {
    cache: new DiskCache({ dir }),
    fetch: throwingFetch,
    credentials: { tenantName: "t", environment: "eu", getToken: async () => "tok" },
  });
  assert.equal(p.generated, false);
  assert.ok(p.rationale.length > 0);
  rmSync(dir, { recursive: true });
});

test("a successful Corti generation is used and marked generated: true", async () => {
  const dir = scratch();
  const capturing: typeof globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "doc-1",
        name: "Why elena_petrova is #1",
        sections: [
          { key: "corti-objective", name: "Objective", text: "SpO2 is worsening; this is the top-ranked patient.", sort: 0 },
          { key: "corti-actions", name: "Actions", text: "", sort: 1 },
          { key: "corti-plan", name: "Plan", text: "Reassess promptly.", sort: 2 },
        ],
        outputLanguage: "en",
      }),
      { status: 201 },
    );
  const [p] = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, {
    cache: new DiskCache({ dir }),
    fetch: capturing,
    credentials: { tenantName: "t", environment: "eu", getToken: async () => "tok" },
  });
  assert.equal(p.generated, true);
  assert.match(p.rationale, /SpO2 is worsening/);
  assert.match(p.rationale, /Reassess promptly/);
  rmSync(dir, { recursive: true });
});

test("a warm cache replays the generated rationale with no credentials at all", async () => {
  const dir = scratch();
  let calls = 0;
  const capturing: typeof globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ id: "doc-1", name: "x", sections: [{ key: "corti-objective", name: "o", text: "Generated once.", sort: 0 }], outputLanguage: "en" }),
      { status: 201 },
    );
  };
  const cache = new DiskCache({ dir });
  const creds = { tenantName: "t", environment: "eu" as const, getToken: async () => "tok" };

  const first = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, { cache, fetch: capturing, credentials: creds });
  assert.equal(first[0]?.generated, true);
  assert.equal(calls, 1);

  const second = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, { cache, fetch: offline });
  assert.equal(second[0]?.generated, true);
  assert.equal(second[0]?.rationale, first[0]?.rationale);
  assert.equal(calls, 1, "the second call replayed the cache and never touched the network");
  rmSync(dir, { recursive: true });
});

// ------------------------------------------------------------- determinism

test("propose is deterministic: same inputs, same proposals, no clock involved", async () => {
  const inputs = [priority({ level: "CRITICAL" }), priority({ level: "HIGH", patientId: "david_kim", rank: 2 })];
  const a = await propose(inputs, ROSTER_WITH_EVERYONE_FREE, NOW, { fetch: offline });
  const b = await propose(inputs, ROSTER_WITH_EVERYONE_FREE, NOW, { fetch: offline });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- approval

test("approve() returns a well-formed action EventInput and mutates nothing", async () => {
  const [p] = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, { fetch: offline });
  const before = JSON.stringify(p);

  const event = approve(p, { proposalId: p.id, approved: true, decidedBy: "Nurse Priya", decidedAt: NOW + 1000 }, NOW + 1000);

  assert.equal(event.source, "action");
  assert.equal(event.patientId, p.patientId);
  assert.equal(event.observation, p.kind);
  assert.equal(event.ts, NOW + 1000);
  assert.equal(event.code, null);
  assert.match(event.quote, /Nurse Priya/);
  assert.ok(typeof event.room === "string" && event.room.length > 0);
  assert.equal(JSON.stringify(p), before, "approve() must not mutate the proposal");
});

test("approve() uses the human's own words when a note is given, and the approved summary otherwise", async () => {
  const [p] = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, { fetch: offline });
  const withNote = approve(p, { proposalId: p.id, approved: true, decidedBy: "Dr Osei", decidedAt: NOW, note: "Yes, go now." }, NOW);
  assert.match(withNote.quote, /Yes, go now\./);

  const withoutNote = approve(p, { proposalId: p.id, approved: true, decidedBy: "Dr Osei", decidedAt: NOW }, NOW);
  assert.match(withoutNote.quote, new RegExp(p.summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("reject() is recorded too — it is information, not a no-op", async () => {
  const [p] = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, { fetch: offline });
  const event = reject(p, { proposalId: p.id, approved: false, decidedBy: "Nurse Grace", decidedAt: NOW }, NOW);
  assert.equal(event.source, "action");
  assert.equal(event.value, "rejected");
  assert.match(event.quote, /Nurse Grace/);
});

test("approve() rejects a decision whose approved flag disagrees with the call", async () => {
  const [p] = await propose([priority()], ROSTER_WITH_EVERYONE_FREE, NOW, { fetch: offline });
  assert.throws(() => approve(p, { proposalId: p.id, approved: false, decidedBy: "X", decidedAt: NOW }, NOW));
});

// Both of these were real defects found by looking at the ward's actual output
// rather than at a test: the same free nurse was offered to three patients at
// once, and the HIGH patient at rank #1 came back unassigned while GREEN
// patients below her were given staff. Neither broke a single existing test,
// because every test until now proposed for one patient at a time.
test("one person is never offered two jobs in the same pass", async () => {
  const ward = [
    priority({ patientId: "a", rank: 1, level: "PERSISTING_CONCERN" }),
    priority({ patientId: "b", rank: 2, level: "PERSISTING_CONCERN" }),
    priority({ patientId: "c", rank: 3, level: "PERSISTING_CONCERN" }),
  ];
  const proposals = await propose(ward, ROSTER, 1_000);

  const assigned = proposals
    .map((p) => p.assignee?.id)
    .filter((id): id is string => id !== undefined);
  assert.equal(
    new Set(assigned).size,
    assigned.length,
    `one person was double-booked: ${assigned.join(", ")}`,
  );
});

test("the scarce person goes to the highest-ranked patient, not the first seen", async () => {
  // Deliberately handed to propose() out of rank order.
  const ward = [
    priority({ patientId: "low", rank: 3, level: "PERSISTING_CONCERN" }),
    priority({ patientId: "top", rank: 1, level: "PERSISTING_CONCERN" }),
  ];
  const proposals = await propose(ward, ROSTER, 1_000);

  const top = proposals.find((p) => p.patientId === "top");
  assert.ok(top, "the top-ranked patient must still get a proposal");
  assert.ok(
    top.assignee !== null,
    "the highest-ranked patient must get the pick of the roster",
  );
});

test("a senior covers for a busy doctor rather than leaving the sickest patient unassigned", async () => {
  // ROSTER's only doctor is unavailable. Before the COVERS fallback existed
  // this returned assignee: null for the ward's most urgent patient.
  const proposals = await propose(
    [priority({ patientId: "sick", rank: 1, level: "HIGH" })],
    ROSTER,
    1_000,
  );
  const only = proposals[0];
  assert.ok(only);
  assert.ok(
    only.assignee !== null && ["doctor", "senior"].includes(only.assignee.role),
    "a HIGH patient must be covered by a doctor or, failing that, a senior",
  );
});
