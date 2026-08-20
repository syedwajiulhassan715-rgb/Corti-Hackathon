// S0 Stage runner. One stage per invocation, never a chain.
//
// This file orchestrates and reports. It holds no pipeline logic of its own:
// every judgement belongs to engines/, projections/ or pipeline/, and if a
// rule ever appears in here it is in the wrong file.
//
// D8: main.ts is one of the two places allowed to read the wall clock. It does
// so once, at the top of a stage, and passes the reading down as an argument.
//
// Stages hand off through a run directory rather than through memory, because
// the point is to run them one at a time and look at what came out:
//
//   runs/<run>/events.jsonl   the event log mirror, the only interface (D5)
//   runs/<run>/slots.json     eventId -> diarization speakerId, which Event
//                             deliberately does not carry (roles.ts decides
//                             the role; the raw slot is transport, not state)
//   runs/<run>/meta.json      what the transcribe stage was asked to do
//
// Every Corti call goes through the disk cache in fixtures/, so a second run
// of any stage is offline by construction. Each stage counts its own fetches
// and prints the number, which is how "zero network calls" gets confirmed
// rather than asserted.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { DiskCache } from "./corti/cache.ts";
import { createCortiAuth } from "./corti/auth.ts";
import { codeText, type PredictedCode } from "./corti/coding.ts";
import { transcribe, type CortiTranscript, type CortiEnvironment } from "./corti/transcribe.ts";
import { EventLog } from "./log/store.ts";
import { ground, type Candidate } from "./pipeline/grounding.ts";
import { propose } from "./pipeline/observations.ts";
import { assignRoles } from "./pipeline/roles.ts";
import type { Event, EventId, Millis } from "./contracts/index.ts";

const RUNS = "runs";
const TRANSCRIPT_CACHE = "fixtures/transcripts";
const CODING_CACHE = "fixtures/coding";
/** corti/transcribe stamps this on every raw utterance. Anything else is derived. */
const OBSERVATION_UTTERANCE = "utterance";

// ---------------------------------------------------------------- arguments

type Args = { readonly _: readonly string[]; readonly [flag: string]: unknown };

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, unknown> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      i += 1;
    }
  }
  return { _: positional, ...flags };
}

function str(args: Args, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" ? value : undefined;
}

function required(args: Args, name: string): string {
  const value = str(args, name);
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
}

// ------------------------------------------------------------- run directory

interface RunMeta {
  readonly audioPath: string;
  readonly room: string;
  readonly startedAt: Millis;
  readonly cacheKey: string;
}

function runDir(run: string): string {
  const dir = join(RUNS, run);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function eventsPath(run: string): string {
  return join(runDir(run), "events.jsonl");
}

function slotsPath(run: string): string {
  return join(runDir(run), "slots.json");
}

function metaPath(run: string): string {
  return join(runDir(run), "meta.json");
}

function readJson<T>(path: string, what: string): T {
  if (!existsSync(path)) {
    throw new Error(`${what} not found at ${path}. Run the stage that produces it first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function loadEvents(run: string): readonly Event[] {
  const path = eventsPath(run);
  if (!existsSync(path)) {
    throw new Error(`No event log at ${path}. Run the transcribe stage first.`);
  }
  return EventLog.load(path).all();
}

function loadSlots(run: string): ReadonlyMap<EventId, number> {
  const raw = readJson<Record<string, number>>(slotsPath(run), "Diarization slot map");
  return new Map(Object.entries(raw));
}

// -------------------------------------------------------------- credentials

/** Wraps fetch so a stage can prove how many times it went to the network. */
function countingFetch(): { fetch: typeof globalThis.fetch; calls: () => number } {
  let calls = 0;
  const wrapped: typeof globalThis.fetch = (input, init) => {
    calls += 1;
    return globalThis.fetch(input, init);
  };
  return { fetch: wrapped, calls: () => calls };
}

/**
 * Credentials from .env, or undefined when --offline was asked for or the
 * environment is not configured. Undefined is not a failure mode: both Corti
 * modules treat a cache miss without credentials as a loud refusal, which is
 * exactly the behaviour an offline run wants.
 */
function credentialsFrom(
  args: Args,
  fetchImpl: typeof globalThis.fetch,
): ReturnType<typeof createCortiAuth> | undefined {
  if (args["offline"] === true) return undefined;

  if (existsSync(".env")) process.loadEnvFile(".env");

  const tenantName = process.env["CORTI_TENANT_NAME"];
  const clientId = process.env["CORTI_CLIENT_ID"];
  const clientSecret = process.env["CORTI_CLIENT_SECRET"];
  const environment = process.env["CORTI_ENVIRONMENT"] as CortiEnvironment | undefined;

  if (!tenantName || !clientId || !clientSecret || !environment) return undefined;

  return createCortiAuth(
    { tenantName, clientId, clientSecret, environment },
    { fetch: fetchImpl },
  );
}

// ------------------------------------------------------------------ reports

function heading(text: string): void {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

function field(name: string, value: unknown): void {
  console.log(`  ${name.padEnd(26)} ${String(value)}`);
}

function ms(value: Millis): string {
  return `${(value / 1000).toFixed(3)}s`;
}

// --------------------------------------------------------- stage: transcribe

async function stageTranscribe(args: Args): Promise<number> {
  const audioPath = required(args, "audio");
  const room = str(args, "room") ?? "room-02";
  const run = str(args, "run") ?? "default";

  // D8: the one clock reading. Offset zero of the recording is pinned to it
  // and passed down; nothing below this line asks what time it is.
  const startedAt: Millis =
    str(args, "started-at") !== undefined ? Number(required(args, "started-at")) : Date.now();

  if (!existsSync(audioPath)) {
    console.error(`Audio file not found: ${audioPath}`);
    return 1;
  }

  const cache = new DiskCache({ dir: TRANSCRIPT_CACHE });
  const file = audioPath.split(/[\\/]/).at(-1) ?? audioPath;
  const cacheKey = str(args, "cache-key") ?? `${file.replace(/\.[^.]+$/, "")}.transcript`;
  const cachePath = cache.path(cacheKey);
  const cachedBefore = cache.has(cacheKey);

  const counter = countingFetch();
  const credentials = credentialsFrom(args, counter.fetch);

  heading(`STAGE transcribe — ${file}`);
  field("audio", audioPath);
  field("bytes on disk", statSync(audioPath).size);
  field("room", room);
  field("startedAt (ms)", startedAt);
  field("cache key", cacheKey);
  field("cache state before", cachedBefore ? "HIT (offline path)" : "MISS (will call Corti)");
  field("credentials", credentials === undefined ? "none — offline only" : "loaded from .env");

  if (!cachedBefore && credentials === undefined) {
    console.error(
      `\n  REFUSED: cache miss for ${cacheKey} and no credentials. ` +
        `Nothing was called and nothing was written.`,
    );
    return 1;
  }

  // A fresh log per transcribe: this stage is the one that creates the run.
  const path = eventsPath(run);
  writeFileSync(path, "", "utf8");
  const log = EventLog.load(path);

  const events = await transcribe(
    { audioPath, room, startedAt, cacheKey },
    { append: (input) => log.append(input), cache, credentials, fetch: counter.fetch },
  );

  const transcript = cache.read<CortiTranscript>(cacheKey)!;
  const segments = transcript.transcripts;

  const speakerIds = [...new Set(segments.map((s) => s.speakerId))].sort((a, b) => a - b);
  const participants = [...new Set(segments.map((s) => s.participant))].sort((a, b) => a - b);
  const channels = [...new Set(segments.map((s) => s.channel))].sort((a, b) => a - b);

  // Monotonic means two things and they are worth separating: segment starts
  // never go backwards, and no segment ends before it began.
  let startsMonotonic = true;
  let wellFormed = true;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    if (segment.end < segment.start) wellFormed = false;
    if (i > 0 && segment.start < segments[i - 1]!.start) startsMonotonic = false;
  }
  let eventTsMonotonic = true;
  for (let i = 1; i < events.length; i += 1) {
    if (events[i]!.ts < events[i - 1]!.ts) eventTsMonotonic = false;
  }

  const lastEnd = segments.at(-1)?.end ?? 0;

  field("network calls", counter.calls());
  field("credits consumed", transcript.usageInfo?.creditsConsumed ?? "n/a");
  field("segment count", segments.length);
  field("distinct speakerIds", `[${speakerIds.join(",")}]  (${speakerIds.length})`);
  field("participants", `[${participants.join(",")}]`);
  field("channels", `[${channels.join(",")}]`);
  field("transcript duration", `${ms(lastEnd)} (last segment end)`);
  field("segment starts monotonic", startsMonotonic ? "YES" : "NO");
  field("segments well-formed", wellFormed ? "YES (end >= start)" : "NO");
  field("event ts monotonic", eventTsMonotonic ? "YES" : "NO");
  field("events appended", events.length);
  field("cache file", cachePath);
  field("cache file written", existsSync(cachePath) ? (cachedBefore ? "already existed" : "YES") : "NO");
  field("participantsRoles", JSON.stringify(transcript.metadata?.participantsRoles ?? null));

  const slots: Record<string, number> = {};
  events.forEach((event, index) => {
    const segment = segments[index];
    if (segment !== undefined) slots[event.id] = segment.speakerId;
  });
  writeJson(slotsPath(run), slots);
  writeJson(metaPath(run), { audioPath, room, startedAt, cacheKey } satisfies RunMeta);

  heading("Segments");
  segments.forEach((segment, index) => {
    console.log(
      `  ${events[index]?.id ?? "?"}  speakerId=${segment.speakerId}  ` +
        `start=${segment.start} end=${segment.end}\n      ${segment.text}`,
    );
  });

  console.log(`\n  wrote ${path}`);
  console.log(`  wrote ${slotsPath(run)}`);
  return 0;
}

// -------------------------------------------------------------- stage: roles

function stageRoles(args: Args): number {
  const run = str(args, "run") ?? "default";
  const events = loadEvents(run);
  const slots = loadSlots(run);

  const assignment = assignRoles(events, slots);

  heading("STAGE roles");
  field("method", assignment.method);
  field("resolved", assignment.resolved ? "YES" : "NO");
  field("note", assignment.note);

  heading("Slot profiles");
  for (const profile of assignment.slots) {
    console.log(
      `  slot ${profile.slot}  utterances=${profile.utterances}  questions=${profile.questions}  ` +
        `questionRate=${profile.questionRate.toFixed(3)}  ` +
        `clinicalRate=${profile.clinicalRate.toFixed(3)}  -> ${profile.role}`,
    );
  }

  if (!assignment.resolved) {
    console.error(
      `\n  UNRESOLVED (${assignment.method}). Every speaker is still 'unknown' and the ` +
        `event log was NOT rewritten. Nothing downstream may assume a role.`,
    );
    return 1;
  }

  // The evidence line has to be able to quote the utterance that earned each
  // label, so print one per slot rather than only the counts.
  heading("First utterance per slot, as attributed");
  const seen = new Set<number>();
  for (const event of assignment.events) {
    if (event.source !== "speech") continue;
    const slot = slots.get(event.id);
    if (slot === undefined || seen.has(slot)) continue;
    seen.add(slot);
    console.log(`  slot ${slot} -> ${event.speaker}\n      ${event.id}  "${event.quote}"`);
  }

  EventLog.write(eventsPath(run), assignment.events);
  console.log(`\n  rewrote ${eventsPath(run)} with speaker labels`);
  return 0;
}

// ------------------------------------------------------------- stage: ground

function stageGround(args: Args): number {
  const run = str(args, "run") ?? "default";
  const events = loadEvents(run);
  const candidatesPath = str(args, "candidates") ?? join(runDir(run), "candidates.json");

  heading("STAGE ground");

  // Propose and gate from the raw utterances only.
  //
  // Derived rows carry the quote and the code of the utterance they came
  // from, so feeding them back to the proposer would let every run re-propose
  // from its own output and the log would grow on each pass. The raw
  // utterances are the input to this stage; the derived rows are its output.
  const utterances = events.filter((e) => e.observation === OBSERVATION_UTTERANCE);

  // pipeline/observations proposes; --candidates overrides it, for exercising
  // the gate against claims it was never going to accept.
  const candidates =
    existsSync(candidatesPath)
      ? readJson<Candidate[]>(candidatesPath, "Candidate facts")
      : propose(utterances);

  field("candidate source", existsSync(candidatesPath) ? candidatesPath : "pipeline/observations.propose()");

  const result = ground(candidates, utterances);

  field("candidates in", candidates.length);
  field("grounded", result.grounded.length);
  field("discarded", result.discarded.length);

  heading("Grounded");
  for (const fact of result.grounded) {
    console.log(
      `  ${fact.candidateId}  ${fact.observation}=${String(fact.value)}  ` +
        `[${fact.eventId} ${fact.speaker} @${fact.ts}]\n      "${fact.quote}"`,
    );
  }

  heading("Discarded");
  for (const discarded of result.discarded) {
    console.log(`  ${discarded.candidate.id}  ${discarded.reason}\n      ${discarded.detail}`);
  }

  writeJson(join(runDir(run), "grounding.json"), result);
  console.log(`\n  wrote ${join(runDir(run), "grounding.json")}`);

  // Append the surviving facts to the log as events.
  //
  // This is the step that makes them real. engines/patientState reads Events
  // whose observation is one of the clinical names — it has never heard of a
  // GroundedFact — and the event log is the only interface between modules
  // (D5). A fact that stays in grounding.json is a fact no engine can see.
  //
  // Each derived event carries the quote, speaker and timestamp of the
  // utterance it came from, so the product law holds on the derived row too:
  // nothing enters state without a quote, a speaker and a time. The quote is
  // copied from the event, never from the candidate.
  //
  // Re-runnable: derived rows are dropped and rebuilt, so grounding twice
  // produces the same log rather than two copies of every fact.
  const rebuilt = new EventLog();
  for (const event of utterances) rebuilt.append(event);

  const originById = new Map(utterances.map((e) => [e.id, e]));
  for (const fact of result.grounded) {
    const origin = originById.get(fact.eventId);
    rebuilt.append({
      ts: fact.ts,
      room: fact.room,
      source: "speech",
      speaker: fact.speaker,
      quote: fact.quote,
      code: origin?.code ?? null,
      observation: fact.observation,
      value: fact.value,
    });
  }

  EventLog.write(eventsPath(run), rebuilt.all());
  heading("Appended to the log");
  field("utterance events", utterances.length);
  field("derived fact events", result.grounded.length);
  field("log size", rebuilt.size);

  return 0;
}

// --------------------------------------------------------------- stage: code

/**
 * V2: the endpoint returns character offsets into the text we sent. That is
 * the whole reason we send the segment and not a paraphrase, so the offsets
 * are worth checking rather than trusting — if a span does not land on the
 * text it claims, the chain from audio to code is broken and the evidence
 * line would be quoting something nobody said.
 */
function checkSpan(quote: string, code: PredictedCode): { ok: boolean; detail: string }[] {
  const results: { ok: boolean; detail: string }[] = [];
  for (const evidence of code.evidences ?? []) {
    const inRange =
      evidence.start >= 0 && evidence.end <= quote.length && evidence.start <= evidence.end;
    const slice = inRange ? quote.slice(evidence.start, evidence.end) : "";
    const matches = inRange && slice === evidence.text;
    results.push({
      ok: matches,
      detail: matches
        ? `span ${evidence.start}-${evidence.end} matches the utterance`
        : `span ${evidence.start}-${evidence.end} of ${quote.length}: ` +
          `slice ${JSON.stringify(slice)} vs evidence ${JSON.stringify(evidence.text)}`,
    });
  }
  return results;
}

async function stageCode(args: Args): Promise<number> {
  const run = str(args, "run") ?? "default";
  const events = loadEvents(run);

  const cache = new DiskCache({ dir: CODING_CACHE });
  const counter = countingFetch();
  const credentials = credentialsFrom(args, counter.fetch);

  heading("STAGE code");
  field("credentials", credentials === undefined ? "none — offline only" : "loaded from .env");

  const speech = events.filter((e) => e.source === "speech" && e.quote.trim() !== "");
  field("speech utterances", speech.length);

  const codeById = new Map<EventId, string>();
  const multi: { event: Event; codes: readonly PredictedCode[] }[] = [];
  let spansChecked = 0;
  let spansFailed = 0;
  let uncoded = 0;

  heading("Codes by utterance");
  for (const event of speech) {
    const response = await codeText(event.quote, { cache, credentials, fetch: counter.fetch });
    const codes = response.codes;

    console.log(`\n  ${event.id}  ${event.speaker}  @${event.ts}\n      "${event.quote}"`);
    if (codes.length === 0) {
      uncoded += 1;
      console.log(`      -> no code returned`);
      continue;
    }
    if (codes.length > 1) multi.push({ event, codes });

    for (const code of codes) {
      const alternatives = (code.alternatives ?? []).map((a) => a.code).join(", ");
      console.log(
        `      -> ${code.code}  ${code.display}` +
          (alternatives === "" ? "" : `   [alt: ${alternatives}]`),
      );
      for (const span of checkSpan(event.quote, code)) {
        spansChecked += 1;
        if (!span.ok) spansFailed += 1;
        console.log(`         ${span.ok ? "SPAN OK" : "SPAN FAIL"}  ${span.detail}`);
      }
    }
    codeById.set(event.id, codes[0]!.code);
  }

  heading("Summary");
  field("network calls", counter.calls());
  field("utterances coded", codeById.size);
  field("utterances uncoded", uncoded);
  field("evidence spans checked", spansChecked);
  field("evidence spans failed", spansFailed);
  field("span assertion", spansFailed === 0 ? "HOLDS" : "BROKEN");
  field("multi-code utterances", multi.length);

  for (const entry of multi) {
    console.log(
      `  ${entry.event.id} returned ${entry.codes.length}: ` +
        `${entry.codes.map((c) => c.code).join(", ")}`,
    );
  }

  // Event.code holds one string (CONTRACTS). The rest of a multi-code
  // utterance stays in the cached response, not on the event.
  const coded = events.map((event) => {
    const code = codeById.get(event.id);
    if (code === undefined || event.source !== "speech") return event;
    return Object.freeze({ ...event, code });
  });
  EventLog.write(eventsPath(run), coded);
  console.log(`\n  rewrote ${eventsPath(run)} with codes`);

  return spansFailed === 0 ? 0 : 1;
}

// ----------------------------------------------------------------- dispatch

const USAGE = `
ECHO stage runner. One stage per invocation.

  npm run stage -- transcribe --audio <path> [--room <room>] [--run <name>]
                              [--started-at <ms>] [--cache-key <key>] [--offline]
  npm run stage -- roles      [--run <name>]
  npm run stage -- ground     [--run <name>] [--candidates <path>]
  npm run stage -- code       [--run <name>] [--offline]

--offline withholds credentials, so a cache miss refuses loudly instead of
calling Corti. Every stage prints its own network call count.
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const stage = args._[0];

  switch (stage) {
    case "transcribe":
      return stageTranscribe(args);
    case "roles":
      return stageRoles(args);
    case "ground":
      return stageGround(args);
    case "code":
      return stageCode(args);
    default:
      console.log(USAGE);
      return stage === undefined ? 0 : 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`\n  STAGE FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
