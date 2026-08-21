// Tests for medical coding. Every test runs offline against responses recorded
// from the real endpoint during V2, with a fetch that throws if anything tries
// to leave the machine.
//
// The load-bearing test is the synonym one: two different phrasings of
// breathlessness, spoken by the same patient in the same recording, must reach
// the same code. That is the whole reason coding is in the pipeline — without
// it, "puffing" and "cannot catch my breath" are two unrelated strings and no
// rule can see that they are the same complaint said twice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DiskCache } from "./cache.ts";
import { cacheKeyFor, codeText, codeGroundedFacts, DEFAULT_SYSTEM } from "./coding.ts";
import type { Event } from "../contracts/index.ts";
import type { GroundedFact } from "../pipeline/grounding.ts";

const CODING_CACHE = join(import.meta.dirname, "../../fixtures/coding");
const TRANSCRIPT = join(
  import.meta.dirname,
  "../../fixtures/transcripts/test_twovoice_01.transcript.json",
);

const offline: typeof globalThis.fetch = () => {
  throw new Error("network call attempted in an offline test");
};

const cache = () => new DiskCache({ dir: CODING_CACHE });
const deps = () => ({ cache: cache(), fetch: offline });

/** The real segments recorded in V1 RESOLVED. */
function segment(contains: string): string {
  const t = JSON.parse(readFileSync(TRANSCRIPT, "utf8")) as {
    transcripts: { text: string }[];
  };
  const found = t.transcripts.find((s) => s.text.includes(contains));
  assert.ok(found, `no segment containing "${contains}"`);
  return found.text;
}

let seq = 0;
function speech(quote: string): Event {
  seq += 1;
  return Object.freeze({
    id: `e_${String(seq).padStart(6, "0")}`,
    ts: 1_000_000 + seq * 1000,
    patientId: "test_patient",
    room: "room-01",
    source: "speech",
    speaker: "patient",
    quote,
    code: null,
    observation: "utterance",
    value: null,
  } satisfies Event);
}

function factFor(event: Event, observation: string): GroundedFact {
  return {
    candidateId: `c_${event.id}`,
    patientId: event.patientId,
    room: event.room,
    observation,
    value: null,
    eventId: event.id,
    quote: event.quote,
    speaker: event.speaker,
    ts: event.ts,
  };
}

// ------------------------------------------------------ the synonym check

test("two phrasings of breathlessness resolve to the same code", async () => {
  const puffing = segment("puffing from just sitting here");
  const cannotCatch = segment("cannot catch my breath");
  assert.notEqual(puffing, cannotCatch, "these must be two different utterances");

  const a = await codeText(puffing, deps());
  const b = await codeText(cannotCatch, deps());

  assert.equal(a.codes[0].code, "R06.02");
  assert.equal(b.codes[0].code, "R06.02");
  assert.equal(a.codes[0].code, b.codes[0].code, "same complaint, same code");
  assert.equal(a.codes[0].display, "Shortness of breath");
});

test("a different complaint gets a different code", async () => {
  const chest = await codeText(segment("sharp pain here in my chest"), deps());
  assert.equal(chest.codes[0].code, "R07.89");
  assert.notEqual(chest.codes[0].code, "R06.02", "coding must discriminate, not just cluster");
});

test("the code carries an evidence span back into the utterance", async () => {
  const text = segment("cannot catch my breath");
  const response = await codeText(text, deps());
  const [evidence] = response.codes[0].evidences ?? [];

  assert.ok(evidence, "a code with no evidence span is not traceable");
  assert.equal(text.slice(evidence.start, evidence.end), evidence.text);
  assert.ok(text.includes(evidence.text));
});

test("alternatives are returned and kept, not silently collapsed", async () => {
  const response = await codeText(segment("puffing from just sitting here"), deps());
  const alternatives = response.codes[0].alternatives ?? [];
  assert.ok(alternatives.length > 0);
  assert.ok(alternatives.some((a) => a.code === "R06.00"));
});

// ------------------------------------------------------ segments not facts

test("coding runs on the utterance, not on a fact label", async () => {
  // The cache is keyed by the words actually spoken. A fact string such as
  // "breathlessness" was never sent and has no entry.
  const c = cache();
  assert.equal(c.has(cacheKeyFor(segment("puffing from just sitting here"))), true);
  assert.equal(c.has(cacheKeyFor("breathlessness")), false);
});

test("a multi-concept utterance returns several codes and none are lost", async () => {
  const readback = await codeText(segment("oxygen saturation"), deps());
  const codes = readback.codes.map((c) => c.code);

  assert.ok(codes.length >= 3, `expected several codes, got ${JSON.stringify(codes)}`);
  assert.ok(codes.includes("R09.02"), "hypoxemia");
  assert.ok(codes.includes("R06.82"), "tachypnea");
  assert.ok(codes.includes("R00.0"), "tachycardia");
});

// -------------------------------------------------- facts and event codes

test("codeGroundedFacts populates code on the supporting event", async () => {
  const event = speech(segment("puffing from just sitting here"));
  const fact = factFor(event, "breathlessness");

  const result = await codeGroundedFacts([fact], [event], deps());

  assert.equal(result.events[0].code, "R06.02");
  assert.equal(result.events[0].quote, event.quote, "the utterance is untouched");
  assert.equal(result.facts.length, 1);
  assert.deepEqual(result.facts, [fact], "facts come back unchanged");
  assert.equal(result.codings[0].display, "Shortness of breath");
  assert.ok(result.codings[0].all.length >= 1, "every returned code is kept");
});

test("two facts on two utterances both end up coded, and agree", async () => {
  const one = speech(segment("puffing from just sitting here"));
  const two = speech(segment("cannot catch my breath"));
  const facts = [factFor(one, "breathlessness"), factFor(two, "breathlessness")];

  const result = await codeGroundedFacts(facts, [one, two], deps());
  const codes = result.events.map((e) => e.code);

  assert.deepEqual(codes, ["R06.02", "R06.02"]);
});

test("a feed event is never coded", async () => {
  const vital: Event = Object.freeze({
    id: "e_900001",
    ts: 1_000_000,
    patientId: "test_patient",
    room: "room-01",
    source: "vital",
    speaker: "unknown",
    quote: "",
    code: null,
    observation: "spo2",
    value: 87,
  });
  const fact: GroundedFact = { ...factFor(vital, "spo2"), quote: "" };

  const result = await codeGroundedFacts([fact], [vital], deps());
  assert.equal(result.events[0].code, null, "CONTRACTS: code is always null for feed sources");
  assert.equal(result.codings.length, 0, "and no call is made for it");
});

test("an event no fact cites is left alone", async () => {
  const cited = speech(segment("puffing from just sitting here"));
  const uncited = speech(segment("sharp pain here in my chest"));

  const result = await codeGroundedFacts([factFor(cited, "breathlessness")], [cited, uncited], deps());

  assert.equal(result.events[0].code, "R06.02");
  assert.equal(result.events[1].code, null, "coding a quote nothing depends on is a call we never read");
});

// ------------------------------------------------------------- the cache

test("a warm cache means no credentials are needed at all", async () => {
  const response = await codeText(segment("puffing from just sitting here"), {
    cache: cache(),
    fetch: offline,
  });
  assert.equal(response.codes[0].code, "R06.02");
});

test("a cache miss without credentials refuses to call rather than failing at the socket", async () => {
  await assert.rejects(
    codeText("a phrase that was never sent to the endpoint", deps()),
    /Cache miss for code_.* and no credentials/,
  );
});

test("the cache key is content-derived and system-scoped", () => {
  const text = "I cannot catch my breath";
  assert.equal(cacheKeyFor(text), cacheKeyFor(text), "stable");
  assert.notEqual(cacheKeyFor(text), cacheKeyFor(text + "."), "different words, different key");
  assert.notEqual(
    cacheKeyFor(text, "icd10cm-outpatient"),
    cacheKeyFor(text, "icd10cm-inpatient"),
    "different system, different key",
  );
  assert.match(cacheKeyFor(text), /^code_icd10cm-outpatient_[0-9a-f]{16}$/);
  assert.equal(DEFAULT_SYSTEM, "icd10cm-outpatient");
});
