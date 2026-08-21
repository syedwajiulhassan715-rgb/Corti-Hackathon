// S? Interaction-scoped facts. GET what Corti already extracted, POST what
// ECHO wants recorded, and map the wire shape onto contracts/clinical.ts's
// ClinicalFact.
//
// The standalone POST /v2/tools/facts/ is 403 on this tenant (see the skill
// file) — every fact call here goes through
// /v2/interactions/{id}/facts/ instead, which is the verified working route.
//
// `group` is REQUIRED on every fact we send, and must be one of the 20 keys
// GET /v2/factgroups/ actually returns (mirrored in contracts/clinical.ts as
// the FactGroup union). Sending an unknown group is a 404 from Corti, not a
// 400 — surprising enough that we check client-side, before the network
// call, rather than let a typo surface as a confusing "not found".
//
// A Corti fact and a ClinicalFact are not the same shape: Corti's fact is
// `{id, text, group, groupId, source, isDiscarded, updatedAt}` — no patient,
// no timestamp, no evidence. ClinicalFact needs all three, plus a non-empty
// evidenceEventIds (product law: nothing enters state without a quote,
// speaker and timestamp). Corti cannot supply that half; only the caller,
// who ran fact extraction against the event log, knows which events grounded
// which fact. So the mapper here takes the Corti fact and the caller-supplied
// evidence side by side, and never invents the evidence itself.
//
// Same shape as coding.ts and interactions.ts: keyed disk cache, injected
// CortiCredentials, cache hit never touches the network. No clock (D8):
// `observedAt` on the resulting ClinicalFact is supplied by the caller.

import { createHash } from "node:crypto";

import type { DiskCache } from "./cache.ts";
import type { CortiCredentials } from "./transcribe.ts";
import type { ClinicalFact, Direction, FactGroup } from "../contracts/clinical.ts";
import type { EventId, Millis, PatientId, Speaker } from "../contracts/index.ts";

/**
 * Corti's own clinical ontology (GET /v2/factgroups/), verified 2026-08-21.
 * Mirrors contracts/clinical.ts FactGroup exactly — kept as a runtime Set
 * here because a type union has no runtime existence, and this module needs
 * to validate a value against it before making a call.
 */
export const FACT_GROUPS: ReadonlySet<FactGroup> = new Set([
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
]);

export function isKnownFactGroup(group: string): group is FactGroup {
  return FACT_GROUPS.has(group as FactGroup);
}

/** One fact as Corti returns it. */
export interface CortiFact {
  readonly id: string;
  readonly text: string;
  readonly group: FactGroup;
  readonly groupId?: string;
  readonly source?: string;
  readonly isDiscarded?: boolean;
  readonly updatedAt?: string;
}

export interface CortiFactsResponse {
  readonly facts: readonly CortiFact[];
}

/** One fact ECHO wants Corti to record against an interaction. */
export interface FactInput {
  readonly text: string;
  readonly group: FactGroup;
  /** Defaults to "user" — ECHO is the source, not Corti's own extraction. */
  readonly source?: string;
}

export interface FactsDeps {
  readonly cache: DiskCache;
  /** Omit for an offline run: a cache miss then fails loudly instead of calling out. */
  readonly credentials?: CortiCredentials;
  /** Seam for tests. Defaults to global fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

/** GET /v2/interactions/{id}/facts/. Cached per interaction. */
export async function getFacts(
  interactionId: string,
  deps: FactsDeps,
  cacheKey = `facts_get_${interactionId}`,
): Promise<CortiFactsResponse> {
  return deps.cache.through<CortiFactsResponse>(cacheKey, async () => {
    if (deps.credentials === undefined) {
      throw new Error(
        `Cache miss for ${cacheKey} and no credentials supplied: refusing to call Corti. ` +
          `Warm the cache, or pass credentials.`,
      );
    }
    return callGet(interactionId, deps.credentials, deps.fetch ?? globalThis.fetch);
  });
}

/** Content-derived cache key: the same facts posted twice is one call. */
export function cacheKeyForPost(interactionId: string, facts: readonly FactInput[]): string {
  const digest = createHash("sha256").update(JSON.stringify({ interactionId, facts })).digest("hex");
  return `facts_post_${digest.slice(0, 16)}`;
}

/**
 * POST /v2/interactions/{id}/facts/.
 *
 * Every group is validated against FACT_GROUPS before either the cache or
 * the network is touched. An unknown group from Corti is a 404 ("fact group
 * not found: <key>") — this check turns that into a clear local error
 * instead, and it fires even on a warm cache: a typo should never quietly
 * ride along because someone else already paid for the call once.
 */
export async function postFacts(
  interactionId: string,
  facts: readonly FactInput[],
  deps: FactsDeps,
  cacheKey?: string,
): Promise<CortiFactsResponse> {
  for (const fact of facts) {
    if (!isKnownFactGroup(fact.group)) {
      throw new Error(
        `Unknown fact group ${JSON.stringify(fact.group)}: must be one of ${[...FACT_GROUPS].join(", ")}`,
      );
    }
  }

  const key = cacheKey ?? cacheKeyForPost(interactionId, facts);
  return deps.cache.through<CortiFactsResponse>(key, async () => {
    if (deps.credentials === undefined) {
      throw new Error(
        `Cache miss for ${key} and no credentials supplied: refusing to call Corti. ` +
          `Warm the cache, or pass credentials.`,
      );
    }
    return callPost(interactionId, facts, deps.credentials, deps.fetch ?? globalThis.fetch);
  });
}

/**
 * What the caller must supply to turn one Corti fact into a ClinicalFact.
 * Corti's fact carries no patient, timestamp or evidence — this is where
 * they come from, and it is the caller's job to have grounded the fact
 * against the event log before calling this.
 */
export interface FactEvidence {
  readonly patientId: PatientId;
  readonly observedAt: Millis;
  /** Non-empty. A fact with none is skipped by mapFactsToClinical rather than constructed. */
  readonly evidenceEventIds: readonly EventId[];
  readonly speaker?: Speaker;
  /** Verbatim quote, when speech-derived. Defaults to the Corti fact's own text. */
  readonly quote?: string;
  readonly code?: string | null;
  readonly value?: string | number | boolean;
  readonly direction?: Direction;
  /** Short name for the fact. Defaults to the Corti fact's own text. */
  readonly name?: string;
}

/**
 * One Corti fact + its evidence -> one ClinicalFact.
 *
 * Throws if evidenceEventIds is empty: "at least one, enforced by the
 * constructor, not the type" (contracts/clinical.ts). This is that
 * constructor for facts arriving from Corti.
 */
export function toClinicalFact(fact: CortiFact, evidence: FactEvidence): ClinicalFact {
  if (evidence.evidenceEventIds.length === 0) {
    throw new Error(
      `Fact ${fact.id} (${fact.text}) has no evidence events: refusing to construct a ` +
        `ClinicalFact with none (product law — nothing enters state without a quote).`,
    );
  }
  return Object.freeze({
    id: fact.id,
    patientId: evidence.patientId,
    observedAt: evidence.observedAt,
    group: fact.group,
    name: evidence.name ?? fact.text,
    value: evidence.value,
    direction: evidence.direction,
    speaker: evidence.speaker,
    quote: evidence.quote ?? fact.text,
    code: evidence.code,
    evidenceEventIds: evidence.evidenceEventIds,
    source: "corti",
  });
}

/**
 * Map every fact Corti returned onto ClinicalFact, given the caller's
 * evidence lookup. A fact with no entry — or an entry with no evidence
 * events — is skipped, not thrown: a failing stage degrades to a missing
 * card, never a crash (test law). `skipped` names what was dropped, so the
 * caller can see the gap instead of it vanishing silently.
 */
export function mapFactsToClinical(
  facts: readonly CortiFact[],
  evidenceById: ReadonlyMap<string, FactEvidence>,
): { readonly facts: readonly ClinicalFact[]; readonly skipped: readonly string[] } {
  const mapped: ClinicalFact[] = [];
  const skipped: string[] = [];

  for (const fact of facts) {
    const evidence = evidenceById.get(fact.id);
    if (evidence === undefined || evidence.evidenceEventIds.length === 0) {
      skipped.push(fact.id);
      continue;
    }
    mapped.push(toClinicalFact(fact, evidence));
  }

  return Object.freeze({ facts: Object.freeze(mapped), skipped: Object.freeze(skipped) });
}

async function callGet(
  interactionId: string,
  credentials: CortiCredentials,
  fetchImpl: typeof globalThis.fetch,
): Promise<CortiFactsResponse> {
  const token = await credentials.getToken();
  const response = await fetchImpl(
    `https://api.${credentials.environment}.corti.app/v2/interactions/${interactionId}/facts/`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Tenant-Name": credentials.tenantName,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Corti get facts failed: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as CortiFactsResponse;
}

async function callPost(
  interactionId: string,
  facts: readonly FactInput[],
  credentials: CortiCredentials,
  fetchImpl: typeof globalThis.fetch,
): Promise<CortiFactsResponse> {
  const token = await credentials.getToken();
  const response = await fetchImpl(
    `https://api.${credentials.environment}.corti.app/v2/interactions/${interactionId}/facts/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Tenant-Name": credentials.tenantName,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        facts: facts.map((f) => ({ text: f.text, group: f.group, source: f.source ?? "user" })),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Corti post facts failed: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as CortiFactsResponse;
}
