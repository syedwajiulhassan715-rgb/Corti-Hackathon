// Tests for document generation. The one real fixture in
// fixtures/documents/ was recorded from a single live call (2026-08-21,
// interaction f07d6952-c547-4ad2-9f9d-46ff394ee325, ~0.024 credits) — every
// other test here either replays that fixture or checks request-building and
// validation, which cost nothing and must never touch the network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DiskCache } from "./cache.ts";
import {
  NURSING_NOTE_SECTION_KEYS,
  NURSING_NOTE_TEMPLATE_KEY,
  cacheKeyFor,
  generateDocument,
  generateHandoffSummary,
  generateNurseRoundNote,
  generateWhyTopPriority,
  type DocumentContextItem,
  type GenerateDocumentInput,
} from "./documents.ts";

const DOCUMENTS = join(import.meta.dirname, "../../fixtures/documents");
const INTERACTION_ID = "f07d6952-c547-4ad2-9f9d-46ff394ee325";

const offline: typeof globalThis.fetch = () => {
  throw new Error("network call attempted in an offline test");
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "echo-documents-"));
}

const context: readonly DocumentContextItem[] = [
  {
    type: "string",
    data:
      "SpO2 fell from 94% baseline to 87% over 40 minutes, two consecutive readings. " +
      "Patient (speech, 09:12): \"I'm puffing just sitting here, can't catch my breath.\" " +
      "Nurse escalated to on-call physician at 09:15.",
  },
];

function warmupInput(): GenerateDocumentInput {
  return {
    interactionId: INTERACTION_ID,
    context,
    templateKey: NURSING_NOTE_TEMPLATE_KEY,
    template: { documentName: "ECHO nurse round — warmup", sectionKeys: [...NURSING_NOTE_SECTION_KEYS] },
    cacheKey: "document_warmup_nurse_note",
  };
}

// ------------------------------------------------------------- the real call

test("a warm cache replays the real generated nursing note with no credentials", async () => {
  const doc = await generateDocument(warmupInput(), { cache: new DiskCache({ dir: DOCUMENTS }), fetch: offline });
  assert.deepEqual(
    doc.sections.map((s) => s.key),
    ["corti-objective", "corti-actions", "corti-plan"],
  );
  assert.ok(doc.sections[0].text.length > 0, "objective section has real generated text");
  assert.equal(doc.outputLanguage, "en");
  assert.ok((doc.usageInfo?.creditsConsumed ?? 0) > 0, "generation costs real credits — the fixture proves it");
});

test("generateNurseRoundNote wraps the verified template + sections and replays the same fixture", async () => {
  const doc = await generateNurseRoundNote(
    INTERACTION_ID,
    context,
    { cache: new DiskCache({ dir: DOCUMENTS }), fetch: offline },
    { documentName: "ECHO nurse round — warmup", cacheKey: "document_warmup_nurse_note" },
  );
  assert.deepEqual(doc.sections.map((s) => s.key), [...NURSING_NOTE_SECTION_KEYS]);
});

// ------------------------------------------------------- request validation

test("template is sent as an object, not the templateKey string (gotcha #1)", async () => {
  const dir = scratch();
  let sentBody: { template?: unknown; templateKey?: unknown } = {};
  const capturing: typeof globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "x", name: "x", sections: [], outputLanguage: "en" }), { status: 201 });
  };

  await generateDocument(
    { ...warmupInput(), cacheKey: "fresh_call" },
    { cache: new DiskCache({ dir }), fetch: capturing, credentials: { tenantName: "t", environment: "eu", getToken: async () => "tok" } },
  );

  assert.equal(typeof sentBody.template, "object");
  assert.notEqual(typeof sentBody.template, "string");
  assert.equal(sentBody.templateKey, NURSING_NOTE_TEMPLATE_KEY);
  assert.deepEqual((sentBody.template as { sectionKeys: string[] }).sectionKeys, [...NURSING_NOTE_SECTION_KEYS]);
  rmSync(dir, { recursive: true });
});

test("sectionKeys and sections are mutually exclusive — supplying both is rejected before any call (gotcha #2)", async () => {
  const dir = scratch();
  const throwingCache = new DiskCache({ dir });
  const input: GenerateDocumentInput = {
    ...warmupInput(),
    template: { documentName: "x", sectionKeys: ["corti-objective"], sections: [{ key: "corti-objective" }] },
  };
  await assert.rejects(
    generateDocument(input, { cache: throwingCache, fetch: offline }),
    /mutually exclusive/,
  );
  rmSync(dir, { recursive: true });
});

test("sections: [] still counts as supplied, so sectionKeys + sections: [] is still rejected", async () => {
  const dir = scratch();
  const input: GenerateDocumentInput = {
    ...warmupInput(),
    template: { documentName: "x", sectionKeys: ["corti-objective"], sections: [] },
  };
  await assert.rejects(
    generateDocument(input, { cache: new DiskCache({ dir }), fetch: offline }),
    /mutually exclusive/,
  );
  rmSync(dir, { recursive: true });
});

test("neither sectionKeys nor sections supplied is also rejected", async () => {
  const dir = scratch();
  const input: GenerateDocumentInput = { ...warmupInput(), template: { documentName: "x" } };
  await assert.rejects(
    generateDocument(input, { cache: new DiskCache({ dir }), fetch: offline }),
    /must supply exactly one/,
  );
  rmSync(dir, { recursive: true });
});

test("an invalid BCP-47 outputLanguage is rejected before the call", async () => {
  const dir = scratch();
  const input: GenerateDocumentInput = { ...warmupInput(), outputLanguage: "english" };
  await assert.rejects(
    generateDocument(input, { cache: new DiskCache({ dir }), fetch: offline }),
    /not a valid BCP-47 tag/,
  );
  rmSync(dir, { recursive: true });
});

test("a valid regional BCP-47 tag passes validation", async () => {
  const dir = scratch();
  const capturing: typeof globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "x", name: "x", sections: [], outputLanguage: "en-GB" }), { status: 201 });
  const doc = await generateDocument(
    { ...warmupInput(), outputLanguage: "en-GB", cacheKey: "en_gb_call" },
    { cache: new DiskCache({ dir }), fetch: capturing, credentials: { tenantName: "t", environment: "eu", getToken: async () => "tok" } },
  );
  assert.equal(doc.outputLanguage, "en-GB");
  rmSync(dir, { recursive: true });
});

test("a cache miss without credentials refuses to call rather than failing at the socket", async () => {
  const dir = scratch();
  await assert.rejects(
    generateDocument({ ...warmupInput(), cacheKey: "never_warmed" }, { cache: new DiskCache({ dir }), fetch: offline }),
    /Cache miss for never_warmed and no credentials/,
  );
  rmSync(dir, { recursive: true });
});

test("cacheKeyFor is content-derived and stable", () => {
  const input = warmupInput();
  assert.equal(cacheKeyFor(input), cacheKeyFor(input));
  assert.notEqual(
    cacheKeyFor(input),
    cacheKeyFor({ ...input, context: [{ type: "string", data: "different" }] }),
    "different context, different key",
  );
  assert.match(cacheKeyFor(input), /^document_[0-9a-f]{16}$/);
});

// -------------------------------------------------- the three helper jobs

test("all three helpers reuse the one verified template + sectionKeys combination", async () => {
  const dir = scratch();
  const bodies: unknown[] = [];
  const capturing: typeof globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "x", name: "x", sections: [], outputLanguage: "en" }), { status: 201 });
  };
  const deps = {
    cache: new DiskCache({ dir }),
    fetch: capturing,
    credentials: { tenantName: "t", environment: "eu" as const, getToken: async () => "tok" },
  };

  await generateNurseRoundNote(INTERACTION_ID, context, deps, { cacheKey: "call_a" });
  await generateWhyTopPriority(INTERACTION_ID, context, deps, { patientName: "Elena Petrova", cacheKey: "call_b" });
  await generateHandoffSummary(INTERACTION_ID, context, deps, { patientName: "Elena Petrova", cacheKey: "call_c" });

  for (const body of bodies as { templateKey: string; template: { sectionKeys: string[] } }[]) {
    assert.equal(body.templateKey, NURSING_NOTE_TEMPLATE_KEY);
    assert.deepEqual(body.template.sectionKeys, [...NURSING_NOTE_SECTION_KEYS]);
  }
  const names = (bodies as { template: { documentName: string } }[]).map((b) => b.template.documentName);
  assert.deepEqual(names, ["ECHO nurse round", "Why Elena Petrova is #1", "Handoff — Elena Petrova"]);
  rmSync(dir, { recursive: true });
});
