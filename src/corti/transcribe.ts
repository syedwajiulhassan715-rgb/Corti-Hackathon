// S1 Audio file -> Corti transcript -> speech Events on the log.
//
// Promoted from the V1 validation script: create interaction, upload the
// recording as raw bytes, create the transcript. No transcoding — /recordings
// accepts WAV, M4A/AAC, MP3, Ogg and WebM as they are.
//
// spokenPunctuation is always true. V1b showed it converts dictated punctuation
// and never invents any, so it can only help; but it also showed some speakers
// dictate none at all, so nothing downstream may assume a quote ends in a full
// stop.
//
// Speaker is 'unknown' on every event. Assigning a role is roles.ts, and V1
// left diarization unproven — writing a guess in here would put an unearned
// speaker label on the evidence line. See docs/VALIDATION.md.
//
// No clock (D8). Corti returns offsets in milliseconds from the start of the
// recording; the caller supplies `startedAt`, the wall-clock ts that offset
// zero corresponds to. Live passes it down from main.ts, replay passes the
// timestamp the recording started at in the scenario.

import { readFileSync } from "node:fs";

import type { DiskCache } from "./cache.ts";
import type { Event, EventId, EventInput, Millis } from "../contracts/index.ts";

export type CortiEnvironment = "eu" | "us";

/** One utterance as Corti returns it. Offsets are ms from the recording start. */
export interface CortiSegment {
  readonly channel: number;
  readonly participant: number;
  readonly speakerId: number;
  readonly text: string;
  readonly start: Millis;
  readonly end: Millis;
}

/** The /transcripts response, as cached on disk. */
export interface CortiTranscript {
  readonly id: string;
  readonly recordingId: string;
  readonly status: string;
  readonly transcripts: readonly CortiSegment[];
  readonly metadata?: { readonly participantsRoles: unknown };
  readonly usageInfo?: { readonly creditsConsumed: number };
}

export interface CortiCredentials {
  readonly tenantName: string;
  readonly environment: CortiEnvironment;
  /** Supplied by corti/auth. Injected so this module never handles the secret. */
  readonly getToken: () => Promise<string>;
}

export interface TranscribeDeps {
  /** Appends to the event log and returns the assigned id. */
  readonly append: (event: EventInput) => EventId;
  readonly cache: DiskCache;
  /** Omit for an offline run: a cache miss then fails loudly instead of calling out. */
  readonly credentials?: CortiCredentials;
  /** Seam for tests. Defaults to global fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

export interface TranscribeRequest {
  /** Path to the audio file. Uploaded as-is. */
  readonly audioPath: string;
  readonly room: string;
  /** Wall-clock ts that recording offset 0 corresponds to. */
  readonly startedAt: Millis;
  /** Cache key. Defaults to the audio filename plus '.transcript'. */
  readonly cacheKey?: string;
  readonly language?: string;
}

const OBSERVATION = "utterance";

function defaultCacheKey(audioPath: string): string {
  const file = audioPath.split(/[\\/]/).at(-1) ?? audioPath;
  const stem = file.replace(/\.[^.]+$/, "");
  return `${stem}.transcript`;
}

/**
 * Turn one Corti segment into an event.
 *
 * source is always 'speech' — this is the only module that produces speech
 * events, and speech is the only source of judgement (D2). code is null:
 * coding happens in corti/coding, and an uncoded quote is still evidence.
 */
export function segmentToEvent(
  segment: CortiSegment,
  room: string,
  startedAt: Millis,
): EventInput {
  return {
    ts: startedAt + segment.start,
    room,
    source: "speech",
    speaker: "unknown",
    quote: segment.text,
    code: null,
    observation: OBSERVATION,
    value: null,
  };
}

/**
 * Fetch (or reuse) the transcript for an audio file and append one speech
 * event per segment. Returns the events as appended, ids included.
 *
 * The cache is consulted first, so a warm key never touches the network and
 * never needs credentials.
 */
export async function transcribe(
  request: TranscribeRequest,
  deps: TranscribeDeps,
): Promise<readonly Event[]> {
  const key = request.cacheKey ?? defaultCacheKey(request.audioPath);

  const transcript = await deps.cache.through<CortiTranscript>(key, async () => {
    if (deps.credentials === undefined) {
      throw new Error(
        `Cache miss for ${key} and no credentials supplied: refusing to call Corti. ` +
          `Warm the cache, or pass credentials.`,
      );
    }
    return callCorti(request, deps.credentials, deps.fetch ?? globalThis.fetch);
  });

  const events: Event[] = [];
  for (const segment of transcript.transcripts) {
    const input = segmentToEvent(segment, request.room, request.startedAt);
    const id = deps.append(input);
    events.push(Object.freeze({ id, ...input }));
  }
  return events;
}

/** Create interaction, upload recording, create transcript. Three calls, in order. */
async function callCorti(
  request: TranscribeRequest,
  credentials: CortiCredentials,
  fetchImpl: typeof globalThis.fetch,
): Promise<CortiTranscript> {
  const api = `https://api.${credentials.environment}.corti.app/v2`;
  const token = await credentials.getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Tenant-Name": credentials.tenantName,
  };

  const interaction = await json<{ interactionId: string }>(
    fetchImpl(`${api}/interactions/`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        encounter: {
          identifier: request.room,
          status: "planned",
          type: "first_consultation",
        },
      }),
    }),
    "create interaction",
  );

  const recording = await json<{ recordingId: string }>(
    fetchImpl(`${api}/interactions/${interaction.interactionId}/recordings/`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      body: readFileSync(request.audioPath),
    }),
    "upload recording",
  );

  return json<CortiTranscript>(
    fetchImpl(`${api}/interactions/${interaction.interactionId}/transcripts/`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        recordingId: recording.recordingId,
        primaryLanguage: request.language ?? "en",
        diarize: true,
        spokenPunctuation: true,
      }),
    }),
    "create transcript",
  );
}

async function json<T>(response: Promise<Response>, what: string): Promise<T> {
  const settled = await response;
  if (!settled.ok) {
    throw new Error(`Corti ${what} failed: HTTP ${settled.status} ${await settled.text()}`);
  }
  return (await settled.json()) as T;
}
