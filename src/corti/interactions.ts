// S? Corti interactions. One interaction per nurse round, carrying the
// patient's real identity.
//
// `patient` is a first-class field on the interaction, which is why identity
// lives here rather than being bolted onto facts or documents later — every
// fact and every generated document is scoped to an interaction, so getting
// the patient right here is what makes the rest of the chain patient-safe.
//
// Same shape as corti/coding and corti/transcribe: keyed disk cache, injected
// getToken via CortiCredentials, and a cache hit never touches the network.
//
// PatientRecord (world/patients.ts) does not carry `gender` or `birthDate` —
// only a free-text `summary` such as "47 years, Female". Rather than guess at
// those two fields from the summary string, `patientFromRecord` below reads
// the same patient.md fixture the record was parsed from and pulls
// "Sex" / "Date of birth" directly. This duplicates two lines of parsing
// world/patients.ts already does, which is a smaller sin than inventing a
// birth date, and it keeps world/patients.ts (owned by another workstream)
// untouched.
//
// No clock (D8): nothing here reads Date.now(). `startedAt` is supplied by
// the caller, same contract as transcribe.ts's `startedAt`.

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import type { DiskCache } from "./cache.ts";
import type { CortiCredentials } from "./transcribe.ts";
import type { Millis } from "../contracts/index.ts";
import type { PatientRecord } from "../world/patients.ts";

/** Corti's own gender enum for `patient.gender`. */
export type CortiGender = "female" | "male" | "unknown";

/** Corti's own encounter status enum, so far as this project uses it. */
export type EncounterStatus = "planned" | "in-progress" | "finished" | "cancelled";

/** The `patient` object Corti expects on interaction create. */
export interface CortiPatientInput {
  /** MRN. Becomes `patient.identifier`. */
  readonly identifier: string;
  readonly name: string;
  readonly gender: CortiGender;
  /** YYYY-MM-DD. Empty string when the chart does not carry one. */
  readonly birthDate: string;
}

export interface CreateInteractionInput {
  /** Unique per encounter. We use `${room}-${startedAt}` by default. */
  readonly encounterIdentifier: string;
  readonly title: string;
  readonly status?: EncounterStatus;
  readonly type?: string;
  /** Wall-clock ts the encounter started. Caller supplies it; we never call Date.now(). */
  readonly startedAt: Millis;
  readonly patient: CortiPatientInput;
  /** Cache key override. Defaults to a hash of the request body. */
  readonly cacheKey?: string;
}

/** POST /v2/interactions/ response. Note: `interactionId`, not `id`. */
export interface CortiInteractionCreated {
  readonly interactionId: string;
  readonly websocketUrl: string;
}

/** One row of GET /v2/interactions/. Note: `id`, not `interactionId` — same value, different key. */
export interface CortiInteractionListed {
  readonly id: string;
  readonly assignedUserId?: string | null;
  readonly encounter: unknown;
  readonly patient: unknown;
  readonly websocketUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CortiInteractionsList {
  readonly interactions: readonly CortiInteractionListed[];
}

export interface InteractionsDeps {
  readonly cache: DiskCache;
  /** Omit for an offline run: a cache miss then fails loudly instead of calling out. */
  readonly credentials?: CortiCredentials;
  /** Seam for tests. Defaults to global fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Content-derived cache key: same encounter + patient asked twice is one call. */
export function cacheKeyForCreate(input: CreateInteractionInput): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        input.encounterIdentifier,
        input.title,
        input.status ?? "planned",
        input.type ?? "first_consultation",
        input.patient,
      ]),
    )
    .digest("hex");
  return `interaction_create_${digest.slice(0, 16)}`;
}

/**
 * Read gender and date of birth straight off the fixture the record came
 * from. `record.slug` is the directory name world/patients.ts already keys
 * charts by (see contracts/events.ts PatientId doc comment).
 */
export function patientFromRecord(record: PatientRecord): CortiPatientInput {
  const path = join("fixtures/provided/text", record.slug, "patient.md");
  const markdown = existsSync(path) ? readFileSync(path, "utf8") : "";

  const sex = markdown.match(/-\s*Sex:\s*(.+)/)?.[1]?.trim().toLowerCase() ?? "";
  const gender: CortiGender = sex === "female" ? "female" : sex === "male" ? "male" : "unknown";
  const birthDate = markdown.match(/-\s*Date of birth:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";

  return Object.freeze({
    identifier: record.mrn,
    name: record.name,
    gender,
    birthDate,
  });
}

/** Create (or reuse) the Corti interaction for one nurse round. */
export async function createInteraction(
  input: CreateInteractionInput,
  deps: InteractionsDeps,
): Promise<CortiInteractionCreated> {
  const key = input.cacheKey ?? cacheKeyForCreate(input);

  return deps.cache.through<CortiInteractionCreated>(key, async () => {
    if (deps.credentials === undefined) {
      throw new Error(
        `Cache miss for ${key} and no credentials supplied: refusing to call Corti. ` +
          `Warm the cache, or pass credentials.`,
      );
    }
    return callCreate(input, deps.credentials, deps.fetch ?? globalThis.fetch);
  });
}

/**
 * List interactions. Cached under `cacheKey` (default: a fixed key), because
 * the same offline run should see the same roster every time it replays —
 * this is a snapshot of the ward at the moment it was fetched, not a live
 * feed (D8: no clock, so "latest" is not a concept this module has).
 */
export async function listInteractions(
  deps: InteractionsDeps,
  cacheKey = "interactions_list",
): Promise<CortiInteractionsList> {
  return deps.cache.through<CortiInteractionsList>(cacheKey, async () => {
    if (deps.credentials === undefined) {
      throw new Error(
        `Cache miss for ${cacheKey} and no credentials supplied: refusing to call Corti. ` +
          `Warm the cache, or pass credentials.`,
      );
    }
    return callList(deps.credentials, deps.fetch ?? globalThis.fetch);
  });
}

async function callCreate(
  input: CreateInteractionInput,
  credentials: CortiCredentials,
  fetchImpl: typeof globalThis.fetch,
): Promise<CortiInteractionCreated> {
  const token = await credentials.getToken();
  const response = await fetchImpl(`https://api.${credentials.environment}.corti.app/v2/interactions/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Tenant-Name": credentials.tenantName,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      encounter: {
        identifier: input.encounterIdentifier,
        status: input.status ?? "planned",
        type: input.type ?? "first_consultation",
        period: { startedAt: new Date(input.startedAt).toISOString() },
        title: input.title,
      },
      patient: input.patient,
    }),
  });

  if (!response.ok) {
    throw new Error(`Corti create interaction failed: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as CortiInteractionCreated;
}

async function callList(
  credentials: CortiCredentials,
  fetchImpl: typeof globalThis.fetch,
): Promise<CortiInteractionsList> {
  const token = await credentials.getToken();
  const response = await fetchImpl(`https://api.${credentials.environment}.corti.app/v2/interactions/`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Tenant-Name": credentials.tenantName,
    },
  });

  if (!response.ok) {
    throw new Error(`Corti list interactions failed: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as CortiInteractionsList;
}
