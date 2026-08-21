// S? Document generation. Interaction-scoped, because the standalone
// POST /v2/tools/generate/ is 403 on this tenant (see the skill file) — every
// generation call here goes through /v2/interactions/{id}/documents/ instead.
//
// Generation EXPLAINS facts; it must never invent them. `context` is the
// deterministic state ECHO already computed — grounded facts, trend signals,
// priority components, all of it citing events — handed to Corti as prose or
// structured text to write *from*. Nothing here asks Corti to decide
// anything; it asks Corti to phrase something ECHO already decided.
//
// Three gotchas below, each discovered by a real call against the live
// tenant (real credits spent to learn each one — do not relearn them):
//
//   1. `template` is an OBJECT, not the string you'd guess from `templateKey`
//      being a string. Its shape is
//      { sectionKeys?, sections?, documentName, description?,
//        additionalInstructions?, additionalInstructionsOverride? }.
//   2. `sectionKeys` and `sections` are MUTUALLY EXCLUSIVE (Corti's own
//      `excluded_with` validation). Supplying both — or supplying
//      `sections: []`, which counts as supplying it — fails with a confusing
//      pair of "both required" / "both excluded" errors. Supply exactly one.
//   3. `templateKey` AND `template` are both required; the string alone is
//      not enough context for Corti to build the document.
//
// `outputLanguage` is validated BCP-47 by Corti; we check the same shape
// client-side so a malformed tag fails before it costs a call.
//
// Only one templateKey + sectionKeys combination is verified against the
// live tenant: "corti-nursing-note" with
// ["corti-objective","corti-actions","corti-plan"]. The three helper
// functions below (nurse-round note, why-this-patient-is-#1, handoff
// summary) all deliberately reuse that one verified combination rather than
// guessing at section keys for corti-patient-summary or corti-h-and-p, which
// were never probed live. They differ only in `documentName`,
// `additionalInstructions` and `context` — the API law is "never guess a
// field name," and an unverified section key is exactly that kind of guess.
//
// Same shape as coding.ts, interactions.ts, facts.ts: keyed disk cache,
// injected CortiCredentials, cache hit never touches the network. No clock
// (D8): nothing here reads Date.now().

import { createHash } from "node:crypto";

import type { DiskCache } from "./cache.ts";
import type { CortiCredentials } from "./transcribe.ts";

export const NURSING_NOTE_TEMPLATE_KEY = "corti-nursing-note";
export const NURSING_NOTE_SECTION_KEYS = ["corti-objective", "corti-actions", "corti-plan"] as const;

/** One item of the deterministic state Corti is asked to write from. */
export interface DocumentContextItem {
  readonly type: string;
  readonly data: string;
}

/** The verified `template` object shape. Note: an object, not a string (gotcha #1). */
export interface DocumentTemplate {
  readonly documentName: string;
  /** Mutually exclusive with `sections` (gotcha #2). */
  readonly sectionKeys?: readonly string[];
  readonly sections?: readonly unknown[];
  readonly description?: string;
  readonly additionalInstructions?: string;
  readonly additionalInstructionsOverride?: boolean;
}

export interface GenerateDocumentInput {
  readonly interactionId: string;
  readonly context: readonly DocumentContextItem[];
  readonly templateKey: string;
  readonly template: DocumentTemplate;
  /** BCP-47. Defaults to "en". */
  readonly outputLanguage?: string;
  /** Cache key override. Defaults to a hash of the request body. */
  readonly cacheKey?: string;
}

export interface DocumentSection {
  readonly key: string;
  readonly name: string;
  readonly text: string;
  readonly sort: number;
}

/** POST /v2/interactions/{id}/documents/ response. */
export interface CortiDocument {
  readonly id: string;
  readonly name: string;
  readonly templateRef?: unknown;
  readonly isStream?: boolean;
  readonly sections: readonly DocumentSection[];
  readonly outputLanguage: string;
  readonly usageInfo?: { readonly creditsConsumed: number };
}

export interface DocumentsDeps {
  readonly cache: DiskCache;
  /** Omit for an offline run: a cache miss then fails loudly instead of calling out. */
  readonly credentials?: CortiCredentials;
  /** Seam for tests. Defaults to global fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Loose BCP-47 check: language, optional subtags. Good enough to catch "english" before it costs a call. */
const BCP47 = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

function assertValidLanguage(tag: string): void {
  if (!BCP47.test(tag)) {
    throw new Error(`outputLanguage ${JSON.stringify(tag)} is not a valid BCP-47 tag`);
  }
}

/**
 * `sectionKeys` and `sections` are excluded_with each other on Corti's side
 * (gotcha #2). Checked here so the confusing pair of API errors never
 * surfaces to a caller — including the case where `sections: []` was passed,
 * which Corti counts as "supplied" even though it looks empty.
 */
function assertExactlyOneSectionsField(template: DocumentTemplate): void {
  const hasSectionKeys = template.sectionKeys !== undefined;
  const hasSections = template.sections !== undefined;
  if (hasSectionKeys && hasSections) {
    throw new Error(
      "template.sectionKeys and template.sections are mutually exclusive: supply exactly one",
    );
  }
  if (!hasSectionKeys && !hasSections) {
    throw new Error("template must supply exactly one of sectionKeys or sections");
  }
}

/** Content-derived cache key: the same generation request twice is one call (and one bill). */
export function cacheKeyFor(input: GenerateDocumentInput): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        interactionId: input.interactionId,
        context: input.context,
        templateKey: input.templateKey,
        template: input.template,
        outputLanguage: input.outputLanguage ?? "en",
      }),
    )
    .digest("hex");
  return `document_${digest.slice(0, 16)}`;
}

/**
 * Generate one document. Validates the two documented gotchas locally before
 * either the cache or the network is touched, so a malformed request never
 * silently becomes a cached error response.
 */
export async function generateDocument(input: GenerateDocumentInput, deps: DocumentsDeps): Promise<CortiDocument> {
  assertExactlyOneSectionsField(input.template);
  const outputLanguage = input.outputLanguage ?? "en";
  assertValidLanguage(outputLanguage);

  const key = input.cacheKey ?? cacheKeyFor(input);
  return deps.cache.through<CortiDocument>(key, async () => {
    if (deps.credentials === undefined) {
      throw new Error(
        `Cache miss for ${key} and no credentials supplied: refusing to call Corti. ` +
          `Warm the cache, or pass credentials.`,
      );
    }
    return callGenerate(input, outputLanguage, deps.credentials, deps.fetch ?? globalThis.fetch);
  });
}

// ------------------------------------------------------- the three helpers

/**
 * The nurse-round note: objective findings, actions taken, plan. The
 * baseline generation job — one round, one note.
 */
export async function generateNurseRoundNote(
  interactionId: string,
  context: readonly DocumentContextItem[],
  deps: DocumentsDeps,
  opts: { readonly documentName?: string; readonly cacheKey?: string } = {},
): Promise<CortiDocument> {
  return generateDocument(
    {
      interactionId,
      context,
      templateKey: NURSING_NOTE_TEMPLATE_KEY,
      template: {
        documentName: opts.documentName ?? "ECHO nurse round",
        sectionKeys: [...NURSING_NOTE_SECTION_KEYS],
      },
      cacheKey: opts.cacheKey,
    },
    deps,
  );
}

/**
 * "Why is this patient #1" — turns a PatientPriority's components and
 * reasons into prose a nurse can read at a glance. The context must already
 * be the deterministic priority breakdown (components, reasons, withheld);
 * this only asks Corti to phrase it, never to re-derive it.
 */
export async function generateWhyTopPriority(
  interactionId: string,
  context: readonly DocumentContextItem[],
  deps: DocumentsDeps,
  opts: { readonly patientName?: string; readonly cacheKey?: string } = {},
): Promise<CortiDocument> {
  return generateDocument(
    {
      interactionId,
      context,
      templateKey: NURSING_NOTE_TEMPLATE_KEY,
      template: {
        documentName: opts.patientName ? `Why ${opts.patientName} is #1` : "Why this patient is #1",
        sectionKeys: [...NURSING_NOTE_SECTION_KEYS],
        additionalInstructions:
          "Explain why this patient ranks first in the ward queue, citing only the trend " +
          "and evidence data given in context. Do not infer a new diagnosis or invent a " +
          "reason that is not already named in context.",
        additionalInstructionsOverride: true,
      },
      cacheKey: opts.cacheKey,
    },
    deps,
  );
}

/**
 * The handoff summary: what the next shift needs to know about this round.
 * Same verified template — see the header comment for why.
 */
export async function generateHandoffSummary(
  interactionId: string,
  context: readonly DocumentContextItem[],
  deps: DocumentsDeps,
  opts: { readonly patientName?: string; readonly cacheKey?: string } = {},
): Promise<CortiDocument> {
  return generateDocument(
    {
      interactionId,
      context,
      templateKey: NURSING_NOTE_TEMPLATE_KEY,
      template: {
        documentName: opts.patientName ? `Handoff — ${opts.patientName}` : "ECHO handoff summary",
        sectionKeys: [...NURSING_NOTE_SECTION_KEYS],
        additionalInstructions:
          "Write a shift handoff summary: what changed this round, what is still open, and " +
          "what the next nurse should check first. Use only the facts and trends in context.",
        additionalInstructionsOverride: true,
      },
      cacheKey: opts.cacheKey,
    },
    deps,
  );
}

async function callGenerate(
  input: GenerateDocumentInput,
  outputLanguage: string,
  credentials: CortiCredentials,
  fetchImpl: typeof globalThis.fetch,
): Promise<CortiDocument> {
  const token = await credentials.getToken();
  const response = await fetchImpl(
    `https://api.${credentials.environment}.corti.app/v2/interactions/${input.interactionId}/documents/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Tenant-Name": credentials.tenantName,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: input.context,
        templateKey: input.templateKey,
        template: input.template,
        outputLanguage,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Corti generate document failed: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as CortiDocument;
}
