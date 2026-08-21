// Simulation: the one real conversation in the ward.
//
// WHY THIS FILE EXISTS. Every other event in the demo ward is a chart parse or
// a deterministic forward projection (trajectory.ts, feeds.ts). Nothing has
// ever produced a SPEECH event, so `patientHistory(...).facts` comes back
// empty for every patient and the "Conversation Evidence" panel has nothing to
// show. This file fixes exactly that, for exactly one patient: it replays the
// cached room-02 recording through the existing, tested pipeline
// (transcribe -> roles -> observations -> grounding) and hands ward.ts the
// resulting speech events.
//
// THE ASSET. fixtures/transcripts/room-02_deteriorating_v1.wav.transcript.json
// is a real, paid-for Corti transcript: two diarized voices, a patient
// reporting new 9/10 chest pain and breathlessness, and a clinician who
// dismisses her twice before the numbers force his hand. It says "Anna Jensen,
// room one oh one" because it was recorded for a different fixture room —
// world/patients.ts already documents that the room/name in a recording is
// not the room/name on the chart it is cast against here. We cast it onto
// elena_petrova/room-02 because her chart carries atrial fibrillation and the
// af-new-chest-pain-or-breathlessness flag in engines/rules/history.rules.ts
// is written for exactly this conversation.
//
// EVERY EVENT CARRIES elena_petrova / room-02. Not parameters — the whole
// point of this module is one specific, real cached asset cast onto one
// specific chart. A parameterised version would invite pointing it at a
// patient whose chart was never checked against the recording.
//
// SYNCHRONOUS, DELIBERATELY, EVEN THOUGH corti/transcribe.ts AND
// corti/coding.ts ARE ASYNC. Those modules are async because they can call a
// live Corti endpoint on a cache miss. This module never does: D8 requires
// ward.ts (and everything that calls wardEvents synchronously — see
// server/index.ts, acceptance.test.ts) to stay a plain synchronous function,
// so conversationEvents reads the same two disk caches
// (fixtures/transcripts, fixtures/coding) directly through DiskCache.read,
// using the identical cache-key algorithms (defaultCacheKey's convention and
// corti/coding.ts's cacheKeyFor) those modules use. Same cache, same key, same
// offline-refuses-loudly behaviour — no network path is skipped that the
// async versions would have taken; there simply isn't one to take, because
// both caches are warm.
//
// DETERMINISTIC, NOT RANDOM. No Date.now(), no Math.random() (see
// conversation.test.ts's mechanical source check, copied from
// ward.test.ts). `startTs` is the caller's wall-clock ts for recording offset
// zero; every other timestamp is that plus a fixed millisecond offset out of
// the cached transcript. Same startTs, same bytes, every time.
//
// PIPELINE, NOT SHORTCUT. This file does not hand-write a single fact. It
// builds speech events from the transcript, assigns roles, codes each
// utterance from the coding cache, proposes candidates, and grounds them —
// exactly pipeline/roles.ts, pipeline/observations.ts and
// pipeline/grounding.ts, unmodified. Whatever the gate in grounding.ts
// rejects stays rejected; that gate is the product law, not a suggestion.

import { DiskCache } from "../corti/cache.ts";
import { segmentToEvent, type CortiTranscript } from "../corti/transcribe.ts";
import { cacheKeyFor, DEFAULT_SYSTEM, type CodingResponse } from "../corti/coding.ts";
import { assignRoles } from "../pipeline/roles.ts";
import { propose, CODE_OBSERVATIONS } from "../pipeline/observations.ts";
import { ground } from "../pipeline/grounding.ts";
import type { Event, EventId, EventInput, Millis, PatientId } from "../contracts/index.ts";

/** The chart this recording is cast against, and why: see the header. */
export const CONVERSATION_PATIENT: PatientId = "elena_petrova";
export const CONVERSATION_ROOM = "room-02";

const TRANSCRIPT_CACHE_DIR = "fixtures/transcripts";
const CODING_CACHE_DIR = "fixtures/coding";

/**
 * The cache key the transcript is stored under. Not derived from a filename
 * convention here — the asset's actual name
 * (room-02_deteriorating_v1.wav.transcript.json) embeds ".wav" ahead of
 * ".transcript", which corti/transcribe.ts's own defaultCacheKey (built for
 * a plain "<stem>.<ext>" audio path) would strip incorrectly. Writing the key
 * literally, once, is more honest than a helper that would silently miss.
 */
const TRANSCRIPT_CACHE_KEY = "room-02_deteriorating_v1.wav.transcript";

/**
 * How long after T0 the recording starts.
 *
 * Fifteen minutes: late enough to read as "the nurse got to this bed a little
 * into the shift", early enough to land the whole ~109-second recording
 * (offsets run 1056ms..108651ms in the cached transcript) well before the
 * first scripted vital update on elena_petrova's acceptance ladder, which
 * lands at T0 + one stepMs (trajectory.ts's default step is 4 hours). By the
 * time the ladder's numbers start climbing, these quotes are already sitting
 * in her history — which is the whole point: the numbers corroborate a
 * conversation that already happened, never the other way round.
 */
export const CONVERSATION_OFFSET_MS = 15 * 60_000;

/** A deterministic, purely-internal id. Never leaves this module: the
 * function returns EventInput, not Event, so no caller ever sees these. */
function localId(i: number): EventId {
  return `conv_${String(i).padStart(2, "0")}`;
}

/**
 * Code one utterance from the warm coding cache, synchronously.
 *
 * Mirrors corti/coding.ts#codeText's offline behaviour exactly (same cache,
 * same cacheKeyFor key, same refusal message) without the async boundary that
 * function carries for its live path. A miss here is not "call Corti
 * instead" — main.ts's `code` stage is what warms this cache; this module
 * only ever replays it.
 */
function codeQuote(quote: string, cache: DiskCache): string | null {
  const key = cacheKeyFor(quote, DEFAULT_SYSTEM);
  const response = cache.read<CodingResponse>(key);
  if (response === undefined) {
    throw new Error(
      `Cache miss for ${key} and no credentials supplied: refusing to call Corti. ` +
        `Warm the cache (npm run -- code), or pass credentials to the code stage directly.`,
    );
  }
  return response.codes[0]?.code ?? null;
}

/**
 * The ICD-10 code to carry onto a derived fact's own event, or null.
 *
 * A derived speech event needs its own `code` field so
 * projections/patientHistory.ts's ClinicalFact.code — and, downstream,
 * engines/rules/history.rules.ts's `triggeredByCodes` — sees it. The right
 * value is whichever code actually produced this observation, not just
 * "whatever code the source utterance carries" — a single utterance can code
 * to one thing and phrase-match to an unrelated observation (see
 * pipeline/observations.ts's header on e_000015), and a phrase-matched
 * observation was never coded at all.
 */
function codeBehind(sourceEvent: Event, observation: string): string | null {
  if (sourceEvent.code === null) return null;
  const matches = CODE_OBSERVATIONS.some(
    (entry) => entry.code === sourceEvent.code && entry.observation === observation,
  );
  return matches ? sourceEvent.code : null;
}

function toEventInput(event: Event): EventInput {
  return {
    ts: event.ts,
    patientId: event.patientId,
    room: event.room,
    source: event.source,
    speaker: event.speaker,
    quote: event.quote,
    code: event.code,
    observation: event.observation,
    value: event.value,
  };
}

export interface ConversationOptions {
  /** Wall-clock ts that the recording's offset zero corresponds to. Supplied
   * by the caller — this module reads no clock (D8). */
  readonly startTs: Millis;
}

/**
 * The room-02 recording, replayed through the real pipeline, as speech
 * events ready to fold into the ward log.
 *
 * Two kinds of event come back, in ts order:
 *   - one per transcript segment (observation "utterance"), speaker resolved
 *     by pipeline/roles.ts where diarization allowed it;
 *   - one per fact pipeline/grounding.ts actually grounded (observation
 *     "symptom" | "hcp_concern" | "severe_statement" | "emergency_request"),
 *     at the same ts as the utterance it was grounded from. These are what
 *     projections/patientHistory.ts turns into ClinicalFacts — see toFact()
 *     there, which excludes bare "utterance" events and keeps everything
 *     else. A candidate the gate discarded produces no event here; it simply
 *     does not exist, per the product law.
 */
export function conversationEvents(options: ConversationOptions): readonly EventInput[] {
  const transcriptCache = new DiskCache({ dir: TRANSCRIPT_CACHE_DIR });
  const codingCache = new DiskCache({ dir: CODING_CACHE_DIR });

  const transcript = transcriptCache.read<CortiTranscript>(TRANSCRIPT_CACHE_KEY);
  if (transcript === undefined) {
    throw new Error(
      `Cache miss for ${TRANSCRIPT_CACHE_KEY} in ${TRANSCRIPT_CACHE_DIR}: refusing to call ` +
        `Corti. This fixture ships warm; something deleted it.`,
    );
  }

  // 1. transcript -> speech events, speaker 'unknown', local ids.
  const untagged: Event[] = transcript.transcripts.map((segment, i) =>
    Object.freeze({
      id: localId(i),
      ...segmentToEvent(segment, CONVERSATION_ROOM, CONVERSATION_PATIENT, options.startTs),
    }),
  );

  // 2. diarization slot map. speakerId IS the slot: pipeline/roles.test.ts's
  // own room-02 fixture (the same recording) builds it exactly this way.
  const slots = new Map<EventId, number>();
  transcript.transcripts.forEach((segment, i) => slots.set(untagged[i]!.id, segment.speakerId));

  const roled = assignRoles(untagged, slots).events;

  // 3. code each utterance from the warm cache. Must happen before propose():
  // propose() only turns a code into a candidate if event.code is already set
  // (pipeline/observations.ts CODE_OBSERVATIONS).
  const coded: Event[] = roled.map((event) => {
    if (event.quote.trim() === "") return event;
    const code = codeQuote(event.quote, codingCache);
    return code === null ? event : Object.freeze({ ...event, code });
  });

  // 4 & 5. propose candidates, then ground them against the same coded,
  // role-assigned events. Discarded candidates are not represented below —
  // that refusal is the point, not a bug to route around.
  const { grounded } = ground(propose(coded), coded);

  const byId = new Map(coded.map((e) => [e.id, e]));
  const derived: EventInput[] = grounded.map((fact) => {
    const source = byId.get(fact.eventId)!;
    return {
      ts: fact.ts,
      patientId: fact.patientId,
      room: fact.room,
      source: "speech",
      speaker: fact.speaker,
      quote: fact.quote,
      code: codeBehind(source, fact.observation),
      observation: fact.observation,
      value: fact.value,
    };
  });

  // Utterances first, derived facts alongside — a stable sort on ts keeps
  // that order for anything sharing a timestamp, so replay is byte-identical.
  return Object.freeze(
    [...coded.map(toEventInput), ...derived].sort((a, b) => a.ts - b.ts),
  );
}
