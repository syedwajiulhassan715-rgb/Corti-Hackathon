// Tests for interaction-scoped facts. GET/POST fixtures are recorded from
// one real warm-up run against the live tenant (2026-08-21, interaction
// f07d6952-c547-4ad2-9f9d-46ff394ee325) — see fixtures/facts/. A fetch that
// throws stands in for the network, so a test that would call out fails
// loudly instead of silently succeeding against the real API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DiskCache } from "./cache.ts";
import {
  FACT_GROUPS,
  cacheKeyForPost,
  getFacts,
  isKnownFactGroup,
  mapFactsToClinical,
  postFacts,
  toClinicalFact,
  type CortiFact,
  type FactEvidence,
  type FactInput,
} from "./facts.ts";

const FACTS = join(import.meta.dirname, "../../fixtures/facts");
const INTERACTION_ID = "f07d6952-c547-4ad2-9f9d-46ff394ee325";

const offline: typeof globalThis.fetch = () => {
  throw new Error("network call attempted in an offline test");
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "echo-facts-"));
}

// -------------------------------------------------------------- fact groups

test("all 20 Corti fact group keys are known", () => {
  assert.equal(FACT_GROUPS.size, 20);
  for (const key of [
    "chief-complaint",
    "history-of-present-illness",
    "past-medical-history",
    "family-history",
    "social-history",
    "functional-status",
    "medications-prior-to-visit",
    "allergies",
    "demographics",
    "vital-signs",
    "laboratory-results",
    "imaging-results",
    "normal-physical-findings",
    "abnormal-physical-findings",
    "denials-of-symptoms",
    "concerns-and-expectations",
    "assessment",
    "plan",
    "actions",
    "other",
  ]) {
    assert.equal(isKnownFactGroup(key), true, key);
  }
});

test("an unknown group is rejected", () => {
  assert.equal(isKnownFactGroup("not-a-real-group"), false);
  assert.equal(isKnownFactGroup("fact-groups"), false, "no hyphenated variant either");
});

// ------------------------------------------------------------------- getFacts

test("a warm cache means no credentials are needed to GET facts", async () => {
  const before = await getFacts(
    INTERACTION_ID,
    { cache: new DiskCache({ dir: FACTS }), fetch: offline },
    "facts_get_warmup_before",
  );
  assert.deepEqual(before.facts, [], "a fresh interaction has no facts yet");
});

test("a GET cache miss without credentials refuses to call", async () => {
  const dir = scratch();
  await assert.rejects(
    getFacts(INTERACTION_ID, { cache: new DiskCache({ dir }), fetch: offline }, "never_warmed"),
    /Cache miss for never_warmed and no credentials/,
  );
  rmSync(dir, { recursive: true });
});

// ------------------------------------------------------------------ postFacts

const twoFacts: readonly FactInput[] = [
  { text: "Patient reports increased shortness of breath since yesterday.", group: "history-of-present-illness" },
  { text: "SpO2 87% on room air, down from baseline 94%.", group: "vital-signs" },
];

test("posting the same two facts replays the cached response Corti actually returned", async () => {
  const posted = await postFacts(
    INTERACTION_ID,
    twoFacts,
    { cache: new DiskCache({ dir: FACTS }), fetch: offline },
    "facts_post_warmup",
  );
  assert.equal(posted.facts.length, 2);
  assert.equal(posted.facts[0].group, "history-of-present-illness");
  assert.equal(posted.facts[1].group, "vital-signs");
  assert.equal(posted.facts[0].source, "user");
  assert.ok(posted.facts[0].id.length > 0, "Corti assigned a real fact id");
});

test("an unknown fact group is rejected before the call, not after — no network, no cache read even attempted", async () => {
  const dir = scratch();
  const throwingCache = new DiskCache({ dir });
  await assert.rejects(
    postFacts(
      INTERACTION_ID,
      [{ text: "x", group: "not-a-real-group" as unknown as FactInput["group"] }],
      { cache: throwingCache, fetch: offline },
    ),
    /Unknown fact group "not-a-real-group"/,
  );
  assert.equal(throwingCache.has(cacheKeyForPost(INTERACTION_ID, [{ text: "x", group: "not-a-real-group" as unknown as FactInput["group"] }])), false);
  rmSync(dir, { recursive: true });
});

test("cacheKeyForPost is content-derived and stable", () => {
  assert.equal(cacheKeyForPost(INTERACTION_ID, twoFacts), cacheKeyForPost(INTERACTION_ID, twoFacts));
  assert.notEqual(
    cacheKeyForPost(INTERACTION_ID, twoFacts),
    cacheKeyForPost("other-interaction", twoFacts),
    "a different interaction is a different key",
  );
  assert.match(cacheKeyForPost(INTERACTION_ID, twoFacts), /^facts_post_[0-9a-f]{16}$/);
});

// ---------------------------------------------------------- toClinicalFact

const cortiFact: CortiFact = {
  id: "f8949b5e-88bc-47c1-b228-3949454ac81f",
  text: "Patient reports increased shortness of breath since yesterday.",
  group: "history-of-present-illness",
};

test("toClinicalFact builds a ClinicalFact carrying the caller's evidence", () => {
  const evidence: FactEvidence = {
    patientId: "elena_petrova",
    observedAt: 1755772800000,
    evidenceEventIds: ["e_000001"],
    speaker: "patient",
    quote: "I'm puffing just sitting here, can't catch my breath.",
  };
  const fact = toClinicalFact(cortiFact, evidence);
  assert.equal(fact.id, cortiFact.id);
  assert.equal(fact.group, "history-of-present-illness");
  assert.equal(fact.patientId, "elena_petrova");
  assert.deepEqual(fact.evidenceEventIds, ["e_000001"]);
  assert.equal(fact.source, "corti");
  assert.equal(fact.speaker, "patient");
});

test("toClinicalFact refuses to build a fact with no evidence events (product law)", () => {
  const evidence: FactEvidence = { patientId: "elena_petrova", observedAt: 0, evidenceEventIds: [] };
  assert.throws(() => toClinicalFact(cortiFact, evidence), /no evidence events/);
});

test("mapFactsToClinical skips facts with no evidence rather than throwing", () => {
  const grounded: FactEvidence = { patientId: "elena_petrova", observedAt: 0, evidenceEventIds: ["e_1"] };
  const evidenceById = new Map([[cortiFact.id, grounded]]);
  const ungroundedFact: CortiFact = { ...cortiFact, id: "no-evidence-fact" };

  const result = mapFactsToClinical([cortiFact, ungroundedFact], evidenceById);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].id, cortiFact.id);
  assert.deepEqual(result.skipped, ["no-evidence-fact"]);
});
