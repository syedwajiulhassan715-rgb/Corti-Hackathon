// Tests for Corti interactions. Every test runs offline against fixtures
// recorded from one real warm-up run against the live tenant (2026-08-21,
// patient elena_petrova / MRN 00990288) — see fixtures/interactions/. A fetch
// that throws stands in for the network, so a test that accidentally calls
// out fails loudly instead of silently succeeding against the real API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DiskCache } from "./cache.ts";
import {
  cacheKeyForCreate,
  createInteraction,
  listInteractions,
  patientFromRecord,
  type CreateInteractionInput,
} from "./interactions.ts";
import { loadRecord } from "../world/patients.ts";

const INTERACTIONS = join(import.meta.dirname, "../../fixtures/interactions");

const offline: typeof globalThis.fetch = () => {
  throw new Error("network call attempted in an offline test");
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "echo-interactions-"));
}

const record = loadRecord("elena_petrova");

function baseInput(): CreateInteractionInput {
  return {
    encounterIdentifier: "room-02-warmup-1755772800000",
    title: "ECHO nurse round",
    startedAt: 1755772800000,
    patient: patientFromRecord(record!),
    cacheKey: "interaction_create_room02_warmup",
  };
}

// ------------------------------------------------------- patientFromRecord

test("patientFromRecord reads gender and birthDate off the chart, MRN as identifier", () => {
  assert.ok(record, "elena_petrova fixture chart must exist");
  const patient = patientFromRecord(record!);
  assert.deepEqual(patient, {
    identifier: "00990288",
    name: "Elena Petrova",
    gender: "female",
    birthDate: "1946-09-05",
  });
});

test("a record whose chart is missing degrades to unknown gender and empty birthDate, not a crash", () => {
  const fake = { slug: "no_such_patient", name: "Nobody", mrn: "000", summary: "", conditions: [], medications: [], encounters: [], simulated: true as const };
  const patient = patientFromRecord(fake);
  assert.equal(patient.gender, "unknown");
  assert.equal(patient.birthDate, "");
  assert.equal(patient.identifier, "000");
});

// ---------------------------------------------------------- createInteraction

test("a warm cache means no credentials are needed to create", async () => {
  const created = await createInteraction(baseInput(), {
    cache: new DiskCache({ dir: INTERACTIONS }),
    fetch: offline,
  });
  assert.equal(created.interactionId, "f07d6952-c547-4ad2-9f9d-46ff394ee325");
  assert.ok(created.websocketUrl.startsWith("wss://"));
  assert.ok(created.websocketUrl.includes(created.interactionId));
});

test("a cache miss without credentials refuses to call rather than failing at the socket", async () => {
  const dir = scratch();
  await assert.rejects(
    createInteraction(
      { ...baseInput(), cacheKey: "never_warmed" },
      { cache: new DiskCache({ dir }), fetch: offline },
    ),
    /Cache miss for never_warmed and no credentials/,
  );
  rmSync(dir, { recursive: true });
});

test("cacheKeyForCreate is content-derived and stable", () => {
  const input = baseInput();
  assert.equal(cacheKeyForCreate(input), cacheKeyForCreate(input));
  assert.notEqual(
    cacheKeyForCreate(input),
    cacheKeyForCreate({ ...input, encounterIdentifier: "different" }),
    "a different encounter is a different key",
  );
  assert.notEqual(
    cacheKeyForCreate(input),
    cacheKeyForCreate({ ...input, patient: { ...input.patient, identifier: "other-mrn" } }),
    "a different patient is a different key",
  );
  assert.match(cacheKeyForCreate(input), /^interaction_create_[0-9a-f]{16}$/);
});

test("the request body sends patient.identifier as the MRN and the object patient shape verified live", async () => {
  const dir = scratch();
  let sentBody: unknown;
  const capturing: typeof globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ interactionId: "x", websocketUrl: "wss://x" }), { status: 200 });
  };

  await createInteraction(baseInput(), {
    cache: new DiskCache({ dir }),
    fetch: capturing,
    credentials: { tenantName: "t", environment: "eu", getToken: async () => "tok" },
  });

  assert.deepEqual((sentBody as { patient: unknown }).patient, {
    identifier: "00990288",
    name: "Elena Petrova",
    gender: "female",
    birthDate: "1946-09-05",
  });
  assert.equal((sentBody as { encounter: { identifier: string } }).encounter.identifier, "room-02-warmup-1755772800000");
  rmSync(dir, { recursive: true });
});

// ------------------------------------------------------------ listInteractions

test("listInteractions replays the cached roster with id (not interactionId) keys", async () => {
  const listed = await listInteractions(
    { cache: new DiskCache({ dir: INTERACTIONS }), fetch: offline },
    "interactions_list_warmup",
  );
  assert.ok(listed.interactions.length > 0);
  for (const row of listed.interactions) {
    assert.equal(typeof row.id, "string");
    assert.ok(row.websocketUrl.startsWith("wss://"));
  }
  assert.ok(
    listed.interactions.some((r) => r.id === "f07d6952-c547-4ad2-9f9d-46ff394ee325"),
    "the interaction created in the same warm-up run shows up in the list",
  );
});
