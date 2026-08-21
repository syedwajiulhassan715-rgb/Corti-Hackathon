// S7 HTTP surface. One projection, two ways to ask for it.
//
// THIS IS ONE OF THE TWO PLACES ALLOWED TO READ THE CLOCK (D8). Everything
// below this file takes `now` as an argument; here is where a real timestamp
// enters the system. GET /ward reads Date.now() and passes it down. GET
// /ward?until=<ms> passes the caller's timestamp instead, which is the whole
// scrub mechanism: the same pure fold, asked about a different moment.
//
// Nothing here computes anything. It parses a query parameter, calls the
// projection, and serialises the result.

import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";

import type { Event, EventId, EventInput, Millis } from "../contracts/index.ts";
import { ward, type RoomCard } from "../projections/ward.ts";
import { history } from "../projections/history.ts";
import { patientHistory } from "../projections/patientHistory.ts";
import { patientTrend } from "../engines/patientTrend.ts";
import { projectPatientCare } from "../projections/careGaps.ts";
import { prioritize, type PatientPriorityInput } from "../engines/prioritization.ts";
import { WARD_ROLES, wardEvents } from "../simulation/ward.ts";
import { propose, approve, reject } from "../agents/proposals.ts";
import { ROSTER } from "../world/roster.ts";
import { EventLog } from "../log/store.ts";
import {
  recordForRoom,
  loadRecord,
  roomForPatient,
  ALL_PATIENTS,
} from "../world/patients.ts";
import type { PatientPriority, PatientTrends, PriorityLevel } from "../contracts/index.ts";
import { createCortiAuth } from "../corti/auth.ts";
import { DiskCache } from "../corti/cache.ts";
import { createInteraction, patientFromRecord } from "../corti/interactions.ts";
import {
  connectCortiStream,
  type CortiFactsMessage,
  type CortiStreamSocketMessage,
  type CortiTranscriptMessage,
  type StreamHandle,
} from "../corti/stream.ts";
import type { CortiEnvironment } from "../corti/transcribe.ts";

/**
 * Offset zero for the demo. A literal, so every run of the demo — and every
 * screenshot, and every rehearsal — describes the same ward.
 */
export const DEMO_T0 = 1_787_212_800_000;
/** The ward's observation cadence. trend.rules expects samples more often than
 * its expectedIntervalMs, so this must stay below it or every patient reads as
 * overdue at once. */
export const DEMO_STEP_MS = 4 * 3_600_000;

export interface ServerOptions {
  /** The event log to project. */
  readonly events: readonly Event[];
  /** Injected for tests. Defaults to the real clock. */
  readonly clock?: () => Millis;
}

export interface WardResponse {
  /** The moment this projection describes. */
  readonly until: Millis;
  /** True when `until` came from the query string rather than the clock. */
  readonly replayed: boolean;
  readonly generated_from_events: number;
  readonly rooms: readonly RoomCard[];
}

/** Parse ?until=. Returns undefined for absent, and null for present-but-invalid. */
export function parseUntil(raw: string | null): Millis | undefined | null {
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * Build the ward payload for a moment.
 *
 * Exported separately from the HTTP plumbing so the projection can be rendered
 * to a file — fixtures/events/sample_ward.json is this function's output — without
 * starting a server.
 */
export function wardResponse(
  events: readonly Event[],
  until: Millis,
  replayed: boolean,
): WardResponse {
  const rooms = ward(events, until);
  return {
    until,
    replayed,
    generated_from_events: events.filter((e) => e.ts <= until).length,
    rooms,
  };
}

export function createServer(options: ServerOptions): Server {
  const clock = options.clock ?? Date.now;
  const initialEvents: readonly Event[] = Object.freeze([...options.events]);

  // THE ONLY MUTABLE STATE IN THE SYSTEM, and it is an append-only log.
  //
  // Approving a proposal has to actually change something, or the demo's last
  // beat is theatre. It appends an `action` event here and every later fold
  // sees it — which is exactly what "the action becomes part of the patient's
  // history" means mechanically. Engines and projections stay pure; the log
  // is the only interface, and this is the one place it grows.
  const live: Event[] = [...options.events];
  // proposalId -> what a human decided. Proposals are recomputed per request
  // (they are a fold, not a store); this remembers only the human's answer.
  const decisions = new Map<string, { approved: boolean; eventId: EventId }>();
  const nurseRounds = new Map<string, { fingerprint: string; response: NurseRoundResponse }>();
  const demoRuns = new Map<string, DemoRun>();
  let demoRunSequence = 0;
  const cortiCredentials = credentialsFromEnvironment();
  const cortiCache = new DiskCache({ dir: "runs/corti" });

  return createHttpServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    // Approving is the one thing a human does that changes state, so it is the
    // one thing that is not a GET.
    if (request.method === "POST" && url.pathname === "/api/decide") {
      return readBody(request, (body) => handleDecide(body, live, decisions, clock, response));
    }

    if (request.method === "POST" && url.pathname === "/api/observations") {
      return readBody(request, (body) => handleNurseRound(body, live, nurseRounds, clock, response));
    }

    if (request.method === "POST" && url.pathname === "/api/demo/runs") {
      return readBody(request, (body) => {
        const nextId = `ECHO-${String(clock()).slice(-6)}-${String(++demoRunSequence).padStart(2, "0")}`;
        void handleDemoStart(body, nextId, live, demoRuns, cortiCredentials, cortiCache, response);
      });
    }

    const demoRoute = url.pathname.match(/^\/api\/demo\/runs\/([^/]+)(?:\/(audio|end|monitor|decide))?$/);
    if (demoRoute && request.method === "POST") {
      const runId = decodeURIComponent(demoRoute[1]!);
      const operation = demoRoute[2];
      if (operation === "audio") {
        const rawSequence = request.headers["x-echo-audio-sequence"];
        const sequence = typeof rawSequence === "string" ? Number(rawSequence) : Number.NaN;
        return readBytes(request, 64_000, (audio, tooLarge) => {
          if (tooLarge) return send(response, 413, { error: "Audio chunks must be 64,000 bytes or smaller." });
          return handleDemoAudio(runId, sequence, audio, demoRuns, response);
        });
      }
      if (operation === "end") return handleDemoEnd(runId, demoRuns, response);
      if (operation === "monitor") {
        return readBody(request, (body) => handleDemoMonitor(runId, body, demoRuns, response));
      }
      if (operation === "decide") {
        return readBody(request, (body) => handleDemoDecide(runId, body, demoRuns, response));
      }
    }

    if (request.method === "POST" && url.pathname === "/api/reset") {
      live.splice(0, live.length, ...initialEvents);
      decisions.clear();
      nurseRounds.clear();
      for (const run of demoRuns.values()) run.stream?.close(1000, "demo reset");
      demoRuns.clear();
      return send(response, 200, { ok: true, events: live.length });
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return response.end();
    }

    if (request.method !== "GET") {
      return send(response, 405, { error: "Only GET and the scoped demo mutation endpoints are supported." });
    }

    // The demo surface. One page, served from disk so it cannot drift from
    // the log it is describing, and /log so it can show the pipeline itself
    // rather than only the card the pipeline produced.
    // The UI. web-next builds to static files (next.config.mjs output:"export")
    // and this serves them, so the demo is ONE process on ONE port rather than
    // a Next server beside an API server. If the build has not been run, fall
    // back to the original single-file board rather than serving a 404 — a
    // failing stage degrades to a plainer surface, never a dead demo.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const built = "web-next/out/index.html";
      if (existsSync(built)) return sendHtml(response, readFileSync(built, "utf8"));
      return sendHtml(response, readFileSync("web/index.html", "utf8"));
    }

    // Static-exported App Router pages (`/ward/`, `/patients/<id>/`). Embedded
    // browsers and preview panes can navigate with `Accept: */*`, so normal
    // app routes must not depend on that header. Preserve the handful of
    // legacy JSON GET routes for programmatic clients unless they explicitly
    // request HTML. A crafted path still cannot escape the build root.
    const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
    const legacyJsonRoute = new Set(["/board", "/history", "/log", "/health", "/ward"]).has(url.pathname);
    if (!url.pathname.startsWith("/api/") && (acceptsHtml || !legacyJsonRoute)) {
      const routePage = buildPath(url.pathname, "index.html");
      if (routePage !== null && existsSync(routePage)) {
        return sendHtml(response, readFileSync(routePage, "utf8"));
      }
    }

    // Static assets emitted by the Next build (/_next/..., icons, chunks).
    if (url.pathname.startsWith("/_next/") || STATIC_FILE.test(url.pathname)) {
      const asset = buildPath(url.pathname);
      // Never let a crafted path climb out of the build directory.
      if (asset === null) {
        return send(response, 403, { error: "No." });
      }
      if (existsSync(asset)) {
        return sendAsset(response, asset);
      }
    }

    // ---------------------------------------------------------------- v2 API
    //
    // Everything below folds the SAME log at the moment the caller asks about,
    // exactly as src/acceptance.test.ts does. There is no server-side state and
    // no cache: `until` is the only thing that varies, which is what makes the
    // scrubber and the simulation clock the same mechanism rather than two.

    if (url.pathname === "/api/ward") {
      const moment = momentFrom(url, clock);
      if (moment === null) return badUntil(response);

      const board = wardBoard(live, moment);
      const queue = board.queue;
      const counts: Record<string, number> = {
        GREEN: 0, WATCH: 0, PERSISTING_CONCERN: 0, HIGH: 0, CRITICAL: 0,
      };
      for (const row of queue) counts[row.level] = (counts[row.level] ?? 0) + 1;

      return send(response, 200, {
        until: moment,
        replayed: url.searchParams.get("until") !== null,
        generated_from_events: live.filter((e) => e.ts <= moment).length,
        counts,
        queue: queue.map((p) => {
          const context = [...live].reverse().find((event) => event.patientId === p.patientId && event.ts <= moment && event.source === "movement");
          return {
            ...p,
            room: roomForPatient(p.patientId) ?? null,
            name: loadRecord(p.patientId)?.name ?? p.patientId,
            locationStatus: typeof context?.value === "string" ? context.value : "bed",
            locationEventId: context?.id ?? null,
            // The trajectory behind the rank, so the floor plan can show WHY a
            // bed is lit rather than only THAT it is. Signals with no current
            // reading are dropped: an empty glyph teaches the reader nothing.
            signals: (board.trends.get(p.patientId)?.signals ?? [])
              .filter((signal) => signal.current !== null)
              .map((signal) => ({
                observation: signal.observation,
                baseline: signal.baseline,
                current: signal.current,
                delta: signal.delta,
                direction: signal.direction,
                concerning: signal.concerning,
                overdue: signal.overdue,
                sampleCount: signal.sampleCount,
              })),
          };
        }),
      });
    }

    if (url.pathname.startsWith("/api/patient/")) {
      const moment = momentFrom(url, clock);
      if (moment === null) return badUntil(response);

      const patientId = decodeURIComponent(url.pathname.slice("/api/patient/".length));
      const record = loadRecord(patientId);
      const view = patientHistory(live, record, moment);
      if (view === undefined || record === undefined) {
        return send(response, 404, { error: `No chart for ${patientId}.` });
      }

      const trends = patientTrend(view, moment);
      const care = projectPatientCare(live, view, trends, moment);
      // Ranked against the WHOLE ward, never in isolation: "why is this
      // patient #1" is not answerable from one patient's data, and a rank
      // computed from one row would be a different number than the queue
      // shows.
      const priority = wardQueue(live, moment).find(
        (p) => p.patientId === patientId,
      );

      return send(response, 200, {
        until: moment,
        patient: {
          patientId,
          name: record.name,
          mrn: record.mrn,
          summary: record.summary,
          room: roomForPatient(patientId) ?? null,
          simulated: record.simulated,
        },
        history: view,
        trends,
        care,
        priority: priority ?? null,
        role: WARD_ROLES.find((r) => r.patientId === patientId) ?? null,
        // The timeline wants whole events, not ids: the UI renders quotes and
        // values, and a second round trip per row would make it unusable.
        events: live.filter(
          (e) => e.patientId === patientId && e.ts <= moment,
        ),
      });
    }

    if (url.pathname === "/api/proposals") {
      const moment = momentFrom(url, clock);
      if (moment === null) return badUntil(response);

      // Proposals are a FOLD, not a store: recomputed from the ward at this
      // moment every time. That is what keeps them consistent with the queue
      // and what makes scrubbing backwards show the proposals as they stood.
      void propose(wardQueue(live, moment), ROSTER, moment)
        .then((proposals) =>
          send(response, 200, {
            until: moment,
            proposals: proposals.map((p) => ({
              ...p,
              patientName: loadRecord(p.patientId)?.name ?? p.patientId,
              status: decisions.get(p.id) === undefined
                ? "pending"
                : decisions.get(p.id)!.approved
                  ? "approved"
                  : "rejected",
            })),
            roster: ROSTER,
          }),
        )
        // Generation or roster trouble degrades to an empty panel, never a
        // dead ward (test law).
        .catch(() => send(response, 200, { until: moment, proposals: [], roster: ROSTER }));
      return;
    }

    const demoStateRoute = url.pathname.match(/^\/api\/demo\/runs\/([^/]+)$/);
    if (demoStateRoute) {
      const runId = decodeURIComponent(demoStateRoute[1]!);
      const run = demoRuns.get(runId);
      if (!run) return send(response, 404, { error: `No demo run ${runId}.` });
      void sendDemoState(run, response);
      return;
    }


    // The stage notes. Which patient is living which story, and why that arc
    // fits their chart — so the demo script and the code cannot drift apart.
    if (url.pathname === "/api/roles") {
      return send(response, 200, { roles: WARD_ROLES });
    }

    // The whole ward at one moment, in one call.
    //
    // Two signals per room, deliberately independent. `level` is the
    // deterministic Patient State, which D10 keeps conservative: a monitor
    // alone may not raise a room above green below the emergency line.
    // `questions` come from the chart held against what is happening now. A
    // room can be green with an open sepsis question, and the board has to be
    // able to say so — collapsing them into one colour would either cry wolf
    // or hide the question.
    if (url.pathname === "/board") {
      const untilParam = parseUntil(url.searchParams.get("until"));
      if (untilParam === null) {
        return send(response, 400, { error: "until must be a non-negative integer in milliseconds." });
      }
      const moment = untilParam ?? clock();
      const cards = ward(live, moment);
      const rooms = cards.map((card) => {
        const view = history(live, recordForRoom(card.room), card.room, moment);
        const vitals: Record<string, number> = {};
        for (const event of live) {
          if (event.room !== card.room || event.ts > moment) continue;
          if (event.source === "speech" || typeof event.value !== "number") continue;
          vitals[event.observation] = event.value;
        }
        return {
          room: card.room,
          kind: card.kind,
          level: card.patient.level,
          previous_level: card.previous_level,
          reason_text: card.patient.reason_text,
          patient: view?.patient ?? null,
          summary: view?.summary ?? null,
          simulated: view?.simulated ?? false,
          vitals,
          questions: view?.flags ?? [],
          extracted: view?.extracted.length ?? 0,
          fresh: view?.fresh.length ?? 0,
        };
      });
      return send(response, 200, { until: moment, rooms });
    }


    // The conversation held against the chart. Same fold, same until.
    if (url.pathname === "/history") {
      const untilParam = parseUntil(url.searchParams.get("until"));
      if (untilParam === null) {
        return send(response, 400, { error: "until must be a non-negative integer in milliseconds." });
      }
      const room = url.searchParams.get("room") ?? "room-02";
      const moment = untilParam ?? clock();
      const view = history(live, recordForRoom(room), room, moment);
      if (view === undefined) {
        return send(response, 404, { error: `No chart mapped to ${room}.` });
      }
      return send(response, 200, { until: moment, ...view });
    }

    if (url.pathname === "/log") {
      return send(response, 200, { events: live });
    }

    if (url.pathname === "/health") {
      return send(response, 200, { ok: true, events: live.length });
    }

    if (url.pathname !== "/ward") {
      return send(response, 404, { error: `No route for ${url.pathname}. Try /ward.` });
    }

    const until = parseUntil(url.searchParams.get("until"));
    if (until === null) {
      return send(response, 400, {
        error: "until must be a non-negative integer in milliseconds.",
      });
    }

    // The clock is read here and nowhere deeper (D8).
    const moment = until ?? clock();
    return send(response, 200, wardResponse(live, moment, until !== undefined));
  });
}

type DemoMode = "live" | "recorded";
type DemoRunStatus = "connecting" | "recording" | "processing" | "ready" | "failed" | "ended";

interface DemoActivity {
  readonly id: string;
  readonly at: Millis;
  readonly type: string;
  readonly source: string;
  readonly label: string;
  readonly detail?: string;
  readonly eventIds: readonly EventId[];
  readonly causedByEventIds: readonly EventId[];
}

interface DemoTranscriptSegment {
  readonly eventId: EventId;
  readonly cortiId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly speakerId: number;
  readonly text: string;
}

interface DemoRun {
  readonly runId: string;
  readonly patientId: string;
  readonly room: string;
  readonly mode: DemoMode;
  readonly startedAt: Millis;
  projectionUntil: Millis;
  status: DemoRunStatus;
  interactionId: string | null;
  stream: StreamHandle | null;
  readonly activities: DemoActivity[];
  readonly eventIds: EventId[];
  /** Isolated replay branch: baseline-at-T0 plus only this run's events. */
  readonly events: Event[];
  readonly finalTranscriptKeys: Set<string>;
  readonly transcriptSegments: DemoTranscriptSegment[];
  partialTranscript: string | null;
  readonly factKeys: Set<string>;
  readonly decisions: Map<string, { approved: boolean; eventId: EventId }>;
  nextAudioSequence: number;
  monitorStep: number;
  readonly initialLevel: PriorityLevel;
  readonly initialRank: number;
  previousLevel: PriorityLevel;
  previousRank: number;
  notificationEventId: EventId | null;
  error: string | null;
}

// ---------------------------------------------------------- live demo pipeline

function credentialsFromEnvironment(): ReturnType<typeof createCortiAuth> | undefined {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const tenantName = process.env.CORTI_TENANT_NAME;
  const clientId = process.env.CORTI_CLIENT_ID;
  const clientSecret = process.env.CORTI_CLIENT_SECRET;
  const environment = process.env.CORTI_ENVIRONMENT as CortiEnvironment | undefined;
  if (!tenantName || !clientId || !clientSecret || (environment !== "eu" && environment !== "us")) return undefined;
  return createCortiAuth({ tenantName, clientId, clientSecret, environment });
}

function normalizeCortiAudioFormat(value: string | undefined): string | null {
  if (value === undefined) return null;
  const compact = value.toLowerCase().replace(/\s+/g, "");
  if (compact === "audio/webm;codecs=opus") return "audio/webm; codecs=opus";
  if (compact === "audio/ogg;codecs=opus") return "audio/ogg; codecs=opus";
  if (compact === "audio/mp4") return "audio/mp4";
  return null;
}

function activity(
  run: DemoRun,
  type: string,
  source: string,
  label: string,
  options: { detail?: string; eventIds?: readonly EventId[]; causedByEventIds?: readonly EventId[]; at?: Millis } = {},
): void {
  run.activities.push(Object.freeze({
    id: `${run.runId}-a${String(run.activities.length + 1).padStart(3, "0")}`,
    at: options.at ?? run.projectionUntil,
    type,
    source,
    label,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    eventIds: Object.freeze([...(options.eventIds ?? [])]),
    causedByEventIds: Object.freeze([...(options.causedByEventIds ?? [])]),
  }));
}

function appendLive(live: Event[], input: EventInput): EventId {
  const log = new EventLog();
  for (const event of live) log.append(event);
  const id = log.append(input);
  live.length = 0;
  live.push(...log.all());
  return id;
}

async function handleDemoStart(
  body: unknown,
  runId: string,
  live: Event[],
  runs: Map<string, DemoRun>,
  credentials: ReturnType<typeof createCortiAuth> | undefined,
  cache: DiskCache,
  response: ServerResponse,
): Promise<void> {
  const input = body as { patientId?: string; mode?: DemoMode; audioFormat?: string } | null;
  const patientId = input?.patientId ?? "elena_petrova";
  const record = loadRecord(patientId);
  if (!record) return send(response, 400, { error: "patientId must name a known patient chart." });
  const mode: DemoMode = input?.mode === "live" ? "live" : "recorded";
  const room = roomForPatient(patientId) ?? "unassigned";
  const audioFormat = mode === "live" ? normalizeCortiAudioFormat(input?.audioFormat) : null;
  if (mode === "live" && audioFormat === null) {
    return send(response, 400, { error: "The browser did not provide a Corti-supported recorder format." });
  }
  // Fork the source-of-truth at T0. This deliberately excludes the ward's
  // deterministic future trajectory and its preloaded conversation: every
  // later decision in this run must be earned by events visible in this run.
  const runEvents = live.filter((event) => event.ts < DEMO_T0);
  const initial = wardQueue(runEvents, DEMO_T0).find((row) => row.patientId === patientId);
  const initialLevel = initial?.level ?? "GREEN";
  const initialRank = initial?.rank ?? ALL_PATIENTS.length;
  const run: DemoRun = {
    runId, patientId, room, mode, startedAt: DEMO_T0 + 60_000, projectionUntil: DEMO_T0,
    status: mode === "live" ? "connecting" : "processing", interactionId: null, stream: null,
    activities: [], eventIds: [], events: [...runEvents], finalTranscriptKeys: new Set(),
    transcriptSegments: [], partialTranscript: null, factKeys: new Set(), decisions: new Map(),
    nextAudioSequence: 0, monitorStep: 0,
    initialLevel, initialRank, previousLevel: initialLevel, previousRank: initialRank,
    notificationEventId: null, error: null,
  };
  runs.set(runId, run);
  activity(run, "run.created", "ECHO EVENT LOG", `Demo run ${runId} created`, { detail: `${record.name} · ${mode === "live" ? "live Corti" : "recorded Corti result"}` });

  if (mode === "recorded") {
    try {
      replayRecordedEncounter(run, run.events);
      return send(response, 201, publicRun(run));
    } catch (error) {
      run.status = "failed"; run.error = (error as Error).message;
      activity(run, "recorded.replay.failed", "RECORDED DEMO RESULT", "Recorded pipeline replay failed", { detail: run.error });
      return send(response, 500, publicRun(run));
    }
  }

  if (!credentials) {
    run.status = "failed";
    run.error = "Corti credentials are not configured on the server.";
    activity(run, "corti.unavailable", "CORTI", "Live Corti unavailable", { detail: "Use the clearly labelled recorded demo result." });
    return send(response, 201, publicRun(run));
  }

  try {
    activity(run, "corti.interaction.creating", "CORTI", "Creating patient-scoped interaction");
    const interaction = await createInteraction({
      encounterIdentifier: runId,
      title: `ECHO live encounter · ${record.name}`,
      status: "in-progress",
      type: "first_consultation",
      startedAt: run.startedAt,
      patient: patientFromRecord(record),
    }, { cache, credentials });
    run.interactionId = interaction.interactionId;
    activity(run, "corti.interaction.created", "CORTI", "Patient-scoped interaction created", { detail: interaction.interactionId });
    run.stream = await connectCortiStream({
      interactionId: interaction.interactionId,
      websocketUrl: interaction.websocketUrl,
      credentials,
      configuration: {
        transcription: {
          primaryLanguage: "en",
          isDiarization: true,
          isMultichannel: false,
          participants: [{ channel: 0, role: "multiple" }],
        },
        mode: { type: "facts", outputLocale: "en" },
        retentionPolicy: "none",
        audioFormat: audioFormat!,
        factGenerationInterval: "fast_init",
      },
    });
    run.status = "recording";
    run.stream.onMessage((message) => handleCortiMessage(run, message, run.events));
    run.stream.onClose(({ code, reason }) => {
      if (run.status === "ended" || run.status === "failed") return;
      run.status = "failed";
      run.error = `Corti stream closed unexpectedly (${code}${reason ? ` ${reason}` : ""}).`;
      activity(run, "corti.stream.closed", "CORTI STREAMS", "Live Corti transport closed before ENDED", { detail: run.error });
    });
    activity(run, "corti.stream.connected", "CORTI STREAMS", "Live Corti stream connected", {
      detail: run.stream.sessionId ? `Session ${run.stream.sessionId}` : "CONFIG_ACCEPTED · upstream omitted session id",
    });
    return send(response, 201, publicRun(run));
  } catch (error) {
    run.status = "failed"; run.error = (error as Error).message;
    activity(run, "corti.stream.failed", "CORTI", "Live Corti connection failed", { detail: run.error });
    return send(response, 201, publicRun(run));
  }
}

function replayRecordedEncounter(run: DemoRun, live: Event[]): void {
  activity(run, "recorded.result.loaded", "RECORDED SYNTHETIC FALLBACK", "Recorded encounter result loaded", { detail: "Presenter-safe fixture · no microphone or live Corti API call" });
  const nurseQuestion = "How are you feeling today?";
  const symptomQuote = "I've been feeling more short of breath since this morning.";
  const nurseFollowUp = "Any chest pain?";
  const fatigueQuote = "No chest pain, but I'm more tired than yesterday.";
  const inputs: EventInput[] = [
    { ts: run.startedAt, patientId: run.patientId, room: run.room, source: "speech", speaker: "nurse", quote: nurseQuestion, code: null, observation: "utterance", value: null },
    { ts: run.startedAt + 4_000, patientId: run.patientId, room: run.room, source: "speech", speaker: "patient", quote: symptomQuote, code: null, observation: "utterance", value: null },
    { ts: run.startedAt + 8_000, patientId: run.patientId, room: run.room, source: "speech", speaker: "nurse", quote: nurseFollowUp, code: null, observation: "utterance", value: null },
    { ts: run.startedAt + 12_000, patientId: run.patientId, room: run.room, source: "speech", speaker: "patient", quote: fatigueQuote, code: null, observation: "utterance", value: null },
    { ts: run.startedAt + 4_001, patientId: run.patientId, room: run.room, source: "speech", speaker: "patient", quote: symptomQuote, code: null, observation: "reported_symptom", value: "Shortness of breath · increased since this morning" },
    { ts: run.startedAt + 12_001, patientId: run.patientId, room: run.room, source: "speech", speaker: "patient", quote: fatigueQuote, code: null, observation: "reported_symptom", value: "Fatigue · worse than yesterday" },
  ];
  inputs.sort((a, b) => a.ts - b.ts);
  const utteranceByQuote = new Map<string, EventId>();
  for (const input of inputs) {
    const parent = input.observation === "utterance" ? [] : [utteranceByQuote.get(input.quote)].filter((id): id is EventId => id !== undefined);
    const id = appendLive(live, { ...input, correlationId: run.runId, causedByEventIds: parent });
    run.eventIds.push(id);
    run.projectionUntil = Math.max(run.projectionUntil, input.ts);
    if (input.observation === "utterance") {
      utteranceByQuote.set(input.quote, id);
      activity(run, "transcript.fixture.persisted", "RECORDED SYNTHETIC FALLBACK", "Transcript segment persisted", { detail: input.quote, eventIds: [id], at: input.ts });
    } else {
      activity(run, "clinical_fact.created", "RECORDED SYNTHETIC FALLBACK", `Fixture fact created · ${String(input.value)}`, { detail: input.quote, eventIds: [id], causedByEventIds: parent, at: input.ts });
    }
  }
  const facts = run.eventIds.filter((id) => live.find((event) => event.id === id)?.observation !== "utterance");
  activity(run, "patient_history.updated", "PATIENT MEMORY", "Patient history updated from recorded fallback", { eventIds: facts, causedByEventIds: run.eventIds, at: run.projectionUntil });
  run.status = "ready";
}

function handleCortiMessage(run: DemoRun, message: CortiStreamSocketMessage, live: Event[]): void {
  if (message.type === "transcript") {
    const segments = [...(message as CortiTranscriptMessage).data].sort((a, b) => a.time.start - b.time.start);
    for (const item of segments) {
      const key = `${item.id}:${item.time.start}:${item.time.end}:${item.speakerId}`;
      if (!item.final) {
        run.partialTranscript = item.transcript;
        activity(run, "corti.transcript.interim", "CORTI STREAMS", "Interim transcript received", { detail: item.transcript });
        continue;
      }
      if (run.finalTranscriptKeys.has(key)) continue;
      run.finalTranscriptKeys.add(key);
      run.partialTranscript = null;
      const ts = run.startedAt + Math.max(0, Math.round(item.time.start * 1_000));
      const id = appendLive(live, {
        ts, patientId: run.patientId, room: run.room, source: "speech", speaker: "unknown",
        quote: item.transcript, code: null, observation: "utterance", value: null,
        correlationId: run.runId, causedByEventIds: [],
      });
      run.transcriptSegments.push(Object.freeze({
        eventId: id, cortiId: item.id, startSeconds: item.time.start, endSeconds: item.time.end,
        speakerId: item.speakerId, text: item.transcript,
      }));
      run.eventIds.push(id); run.projectionUntil = Math.max(run.projectionUntil, ts);
      const speaker = item.speakerId >= 0 ? `speaker ${item.speakerId + 1}` : "speaker unresolved";
      activity(run, "corti.transcript.final", "CORTI STREAMS", `Final transcript · ${speaker}`, { detail: item.transcript, eventIds: [id], at: ts });
    }
    return;
  }
  if (message.type === "facts") {
    const created: EventId[] = [];
    for (const fact of (message as CortiFactsMessage).facts.filter((item) => !item.isDiscarded)) {
      if (run.factKeys.has(fact.id)) continue;
      run.factKeys.add(fact.id);
      const id = appendLive(live, {
        ts: Math.max(run.projectionUntil, run.startedAt), patientId: run.patientId, room: run.room, source: "speech", speaker: "unknown",
        quote: "", code: null, observation: "corti_fact", value: fact.text,
        correlationId: run.runId, causedByEventIds: [],
      });
      run.eventIds.push(id); created.push(id);
      activity(run, "clinical_fact.created", "CORTI FACTS", `Clinical fact created · ${fact.group.replace(/-/g, " ")}`, {
        detail: `${fact.text} · linked to encounter ${run.runId}; Corti supplied no segment-level evidence id`,
        eventIds: [id],
      });
    }
    if (created.length > 0) {
      activity(run, "patient_history.updated", "PATIENT MEMORY", "Patient history updated from live conversation", { eventIds: created });
    }
    return;
  }
  if (message.type === "flushed") activity(run, "corti.stream.flushed", "CORTI STREAMS", "Buffered audio processed");
  if (message.type === "ENDED") { run.status = "ended"; activity(run, "corti.stream.ended", "CORTI STREAMS", "Live encounter ended"); }
  if (message.type === "error") { run.status = "failed"; run.error = "Corti stream returned an error."; activity(run, "corti.stream.error", "CORTI", "Corti stream error"); }
}

function handleDemoAudio(
  runId: string,
  sequence: number,
  audio: Buffer | null,
  runs: Map<string, DemoRun>,
  response: ServerResponse,
): void {
  const run = runs.get(runId);
  if (!run) return send(response, 404, { error: `No demo run ${runId}.` });
  if (!run.stream || run.status !== "recording") return send(response, 409, { error: "This run does not have an active Corti stream." });
  if (!Number.isInteger(sequence) || sequence < 0) return send(response, 400, { error: "X-ECHO-Audio-Sequence must be a non-negative integer." });
  if (sequence < run.nextAudioSequence) return send(response, 202, { ok: true, duplicate: true, sequence });
  if (sequence > run.nextAudioSequence) return send(response, 409, { error: `Expected audio sequence ${run.nextAudioSequence}, received ${sequence}.` });
  if (!audio?.length) return send(response, 400, { error: "Audio chunk is empty." });
  try {
    run.stream.sendAudio(audio);
    run.nextAudioSequence += 1;
    if (!run.activities.some((item) => item.type === "audio.started")) activity(run, "audio.started", "BROWSER MICROPHONE", "Live microphone audio entered the Corti stream");
    return send(response, 202, { ok: true, bytes: audio.length, sequence });
  } catch (error) {
    run.status = "failed"; run.error = (error as Error).message;
    activity(run, "audio.failed", "BROWSER MICROPHONE", "Audio delivery failed", { detail: run.error });
    return send(response, 500, { error: run.error });
  }
}

function handleDemoEnd(runId: string, runs: Map<string, DemoRun>, response: ServerResponse): void {
  const run = runs.get(runId);
  if (!run) return send(response, 404, { error: `No demo run ${runId}.` });
  if (!run.stream) return send(response, 409, { error: "This run has no live Corti stream." });
  if (run.status === "processing" || run.status === "ended") return send(response, 202, publicRun(run));
  if (run.status !== "recording") return send(response, 409, { error: `Cannot end a run in ${run.status} state.` });
  try {
    // Corti `end` processes remaining audio and emits the final transcript,
    // facts, usage and ENDED. Sending `flush` immediately before it can race.
    run.stream.end(); run.status = "processing";
    activity(run, "corti.processing", "CORTI STREAMS", "Finalizing transcript and facts");
    return send(response, 202, publicRun(run));
  } catch (error) {
    run.status = "failed"; run.error = (error as Error).message;
    activity(run, "corti.end.failed", "CORTI STREAMS", "Could not finalize the encounter", { detail: run.error });
    return send(response, 500, publicRun(run));
  }
}

function handleDemoMonitor(runId: string, body: unknown, runs: Map<string, DemoRun>, response: ServerResponse): void {
  const run = runs.get(runId);
  if (!run) return send(response, 404, { error: `No demo run ${runId}.` });
  const expectedStep = (body as { expectedStep?: number } | null)?.expectedStep;
  if (!Number.isInteger(expectedStep) || expectedStep! < 0) {
    return send(response, 400, { error: "expectedStep must be a non-negative integer." });
  }
  if (expectedStep! < run.monitorStep) return send(response, 200, { ...publicRun(run), duplicate: true });
  if (expectedStep! > run.monitorStep) return send(response, 409, { error: `Expected monitor step ${run.monitorStep}.` });
  const live = run.events;
  const ladder = [
    { spo2: 97, heart_rate: 82, respiratory_rate: 18, systolic_bp: 120 },
    { spo2: 95, heart_rate: 91, respiratory_rate: 26, systolic_bp: 128 },
    { spo2: 93, heart_rate: 101, respiratory_rate: 28, systolic_bp: 136 },
    { spo2: 91, heart_rate: 108, respiratory_rate: 30, systolic_bp: 140 },
  ] as const;
  const offsets = [2, 62, 122, 242].map((minutes) => minutes * 60_000);
  if (run.monitorStep >= ladder.length) return send(response, 409, { error: "The four-step device stream is complete." });
  const values = ladder[run.monitorStep]!;
  const ts = DEMO_T0 + offsets[run.monitorStep]!;
  const ids = (["spo2", "heart_rate", "respiratory_rate", "systolic_bp"] as const).map((observation) => appendLive(live, {
    ts, patientId: run.patientId, room: run.room, source: "vital", speaker: "unknown", quote: "", code: null,
    observation, value: values[observation], correlationId: run.runId, causedByEventIds: [],
  }));
  run.eventIds.push(...ids); run.monitorStep += 1; run.projectionUntil = ts;
  activity(run, "vital.received", "SIMULATED BEDSIDE MONITOR", `SpO₂ ${values.spo2}% · HR ${values.heart_rate} · RR ${values.respiratory_rate} · SBP ${values.systolic_bp}`, { eventIds: ids, at: ts });
  const view = patientHistory(live, loadRecord(run.patientId), ts)!;
  const trends = patientTrend(view, ts);
  activity(run, "trend.recalculated", "ECHO DETERMINISTIC ENGINE", `${trends.agreementCount} concerning signals · ${Math.round(trends.persistenceMs / 3_600_000)}h persistence`, { causedByEventIds: ids, at: ts });
  const priority = wardQueue(live, ts).find((row) => row.patientId === run.patientId);
  let priorityEventId: EventId | null = null;
  if (priority && (priority.level !== run.previousLevel || priority.rank !== run.previousRank)) {
    priorityEventId = appendLive(live, {
      ts: ts + 1, patientId: run.patientId, room: run.room, source: "action", speaker: "unknown",
      quote: `ECHO deterministic priority changed from ${run.previousLevel} to ${priority.level}; rank ${run.previousRank} to ${priority.rank}.`,
      code: null, observation: "priority_changed", value: priority.level, correlationId: run.runId,
      causedByEventIds: priority.evidenceEventIds,
    });
    run.eventIds.push(priorityEventId); run.projectionUntil = ts + 1;
    activity(run, "priority.changed", "ECHO DETERMINISTIC ENGINE", `${run.previousLevel.replace(/_/g, " ")} → ${priority.level.replace(/_/g, " ")} · #${run.previousRank} → #${priority.rank}`, { eventIds: [priorityEventId], causedByEventIds: priority.evidenceEventIds, at: ts + 1 });
    run.previousLevel = priority.level; run.previousRank = priority.rank;
  }
  if (priority && (priority.level === "HIGH" || priority.level === "CRITICAL") && run.notificationEventId === null) {
    const parent = priorityEventId === null ? priority.evidenceEventIds : [priorityEventId];
    const notificationId = appendLive(live, {
      ts: ts + 2, patientId: run.patientId, room: run.room, source: "action", speaker: "unknown",
      quote: `${loadRecord(run.patientId)?.name ?? run.patientId} requires reassessment. ${priority.reasons[0] ?? "Persistent deterioration detected."}`,
      code: null, observation: "notification_created", value: "in-app", correlationId: run.runId,
      causedByEventIds: parent,
    });
    run.notificationEventId = notificationId; run.eventIds.push(notificationId); run.projectionUntil = ts + 2;
    activity(run, "notification.created", "ECHO IN-APP NOTIFICATION", "Nurse notification prepared", { eventIds: [notificationId], causedByEventIds: parent, at: ts + 2 });
  }
  return send(response, 201, publicRun(run));
}

function handleDemoDecide(runId: string, body: unknown, runs: Map<string, DemoRun>, response: ServerResponse): void {
  const run = runs.get(runId);
  if (!run) return send(response, 404, { error: `No demo run ${runId}.` });
  const input = body as { proposalId?: string; approved?: boolean; decidedBy?: string; note?: string } | null;
  if (input?.proposalId === undefined || typeof input.approved !== "boolean") {
    return send(response, 400, { error: "proposalId and approved are required." });
  }
  const moment = run.projectionUntil + 1;
  void propose(wardQueue(run.events, run.projectionUntil), ROSTER, run.projectionUntil)
    .then((proposals) => {
      const proposal = proposals.find((item) => item.id === input.proposalId);
      if (!proposal) return send(response, 404, { error: `No run-scoped proposal ${input.proposalId}.` });
      if (run.decisions.has(proposal.id)) return send(response, 409, { error: "That proposal has already been decided." });
      const decision = {
        proposalId: proposal.id,
        approved: input.approved as boolean,
        decidedBy: input.decidedBy ?? "Charge nurse",
        decidedAt: moment,
        ...(input.note === undefined ? {} : { note: input.note }),
      };
      const base = input.approved ? approve(proposal, decision, moment) : reject(proposal, decision, moment);
      const id = appendLive(run.events, {
        ...base, correlationId: run.runId, causedByEventIds: proposal.evidenceEventIds,
      });
      run.eventIds.push(id); run.projectionUntil = moment;
      run.decisions.set(proposal.id, { approved: decision.approved, eventId: id });
      activity(run, decision.approved ? "action.approved" : "action.rejected", "HUMAN DECISION", decision.approved ? "Prepared action approved and recorded" : "Prepared action rejected and recorded", {
        detail: base.quote, eventIds: [id], causedByEventIds: proposal.evidenceEventIds, at: moment,
      });
      return send(response, 200, { ok: true, eventId: id, proposalId: proposal.id, approved: decision.approved });
    })
    .catch((error: Error) => send(response, 500, { error: error.message }));
}

async function sendDemoState(run: DemoRun, response: ServerResponse): Promise<void> {
  const live = run.events;
  const record = loadRecord(run.patientId)!;
  const historyView = patientHistory(live, record, run.projectionUntil)!;
  const trends = patientTrend(historyView, run.projectionUntil);
  const care = projectPatientCare(live, historyView, trends, run.projectionUntil);
  const rawQueue = wardQueue(live, run.projectionUntil);
  const priority = rawQueue.find((row) => row.patientId === run.patientId) ?? null;
  const queue = rawQueue.map((row) => ({
    ...row,
    name: loadRecord(row.patientId)?.name ?? row.patientId,
    room: roomForPatient(row.patientId) ?? null,
    locationStatus: "bed",
    locationEventId: null,
  }));
  let proposals: unknown[] = [];
  try {
    proposals = (await propose(rawQueue, ROSTER, run.projectionUntil))
      .filter((item) => item.patientId === run.patientId)
      .map((item) => ({ ...item, status: run.decisions.get(item.id) === undefined ? "pending" : run.decisions.get(item.id)!.approved ? "approved" : "rejected" }));
  } catch { proposals = []; }
  const events = run.eventIds.map((id) => live.find((event) => event.id === id)).filter((event): event is Event => event !== undefined);
  const cited = new Set<EventId>([
    ...(priority?.evidenceEventIds ?? []),
    ...trends.signals.flatMap((signal) => signal.evidenceEventIds),
    ...events.flatMap((event) => event.causedByEventIds ?? []),
  ]);
  const evidenceEvents = live.filter((event) => cited.has(event.id));
  send(response, 200, {
    ...publicRun(run),
    patient: { patientId: run.patientId, displayId: "P-014", name: record.name, room: run.room, mrn: record.mrn },
    events, evidenceEvents, history: historyView, trends, care, priority, queue, proposals,
  });
}

function publicRun(run: DemoRun): Record<string, unknown> {
  return {
    runId: run.runId, patientId: run.patientId, room: run.room, mode: run.mode, status: run.status,
    startedAt: run.startedAt, projectionUntil: run.projectionUntil, interactionId: run.interactionId,
    monitorStep: run.monitorStep, notificationEventId: run.notificationEventId, error: run.error,
    initialLevel: run.initialLevel, initialRank: run.initialRank,
    transcriptSegments: run.transcriptSegments, partialTranscript: run.partialTranscript,
    activities: run.activities,
  };
}

type NurseRoundVital = "systolic_bp" | "diastolic_bp" | "heart_rate" | "spo2" | "respiratory_rate" | "temperature";

interface NurseRoundInput {
  readonly requestId?: string;
  readonly patientId?: string;
  readonly observedAt?: number;
  readonly note?: string;
  readonly vitals?: Partial<Record<NurseRoundVital, number>>;
}

interface NurseRoundResponse {
  readonly ok: true;
  readonly requestId: string;
  readonly patientId: string;
  readonly eventIds: readonly EventId[];
  readonly historyUpdated: true;
  readonly duplicate: boolean;
}

const VITAL_LIMITS: Readonly<Record<NurseRoundVital, readonly [number, number]>> = Object.freeze({
  systolic_bp: [40, 300], diastolic_bp: [20, 200], heart_rate: [20, 250],
  spo2: [50, 100], respiratory_rate: [4, 80], temperature: [30, 45],
  });

/** One ordinary nursing interaction -> append-only history, with safe retries. */
function handleNurseRound(
  body: unknown,
  live: Event[],
  requests: Map<string, { fingerprint: string; response: NurseRoundResponse }>,
  clock: () => Millis,
  response: ServerResponse,
): void {
  const input = body as NurseRoundInput | null;
  if (!input || typeof input.requestId !== "string" || input.requestId.trim() === "") {
    return send(response, 400, { error: "requestId is required for retry-safe capture." });
  }
  if (typeof input.patientId !== "string" || loadRecord(input.patientId) === undefined) {
    return send(response, 400, { error: "patientId must name a known patient chart." });
  }
  const observedAt = input.observedAt ?? clock();
  if (!Number.isInteger(observedAt) || observedAt < 0) {
    return send(response, 400, { error: "observedAt must be a non-negative integer in milliseconds." });
  }
  const note = input.note?.trim() ?? "";
  if (note.length > 2_000) return send(response, 400, { error: "note must be 2000 characters or fewer." });

  const vitals = input.vitals ?? {};
  const vitalEntries = Object.entries(vitals) as [NurseRoundVital, number][];
  for (const [name, value] of vitalEntries) {
    const limits = VITAL_LIMITS[name];
    if (limits === undefined || typeof value !== "number" || !Number.isFinite(value) || value < limits[0] || value > limits[1]) {
      return send(response, 400, { error: `Invalid ${name} value.` });
    }
  }
  if (vitalEntries.length === 0 && note === "") {
    return send(response, 400, { error: "At least one vital or an observation note is required." });
  }

  const fingerprint = JSON.stringify({ patientId: input.patientId, observedAt, note, vitals });
  const prior = requests.get(input.requestId);
  if (prior !== undefined) {
    if (prior.fingerprint !== fingerprint) {
      return send(response, 409, { error: "requestId was already used for different content." });
    }
    return send(response, 200, { ...prior.response, duplicate: true });
  }

  const room = roomForPatient(input.patientId) ?? "unassigned";
  const pending: EventInput[] = vitalEntries.map(([observation, value]) => ({
    ts: observedAt, patientId: input.patientId!, room, source: "vital", speaker: "unknown",
    quote: "", code: null, observation, value: value!,
  }));
  if (note !== "") {
    pending.push({
      ts: observedAt, patientId: input.patientId, room, source: "speech", speaker: "nurse",
      quote: note, code: null, observation: "utterance", value: null,
    });
    // Deterministic fixture adapter: it preserves exactly what the nurse said
    // and makes no diagnostic inference. Corti facts/coding may enrich this
    // later without changing the ingestion contract.
    pending.push({
      ts: observedAt, patientId: input.patientId, room, source: "speech", speaker: "nurse",
      quote: note, code: null, observation: "nurse_observation", value: note,
    });
  }

  const log = new EventLog();
  for (const event of live) log.append(event);
  const eventIds = pending.map((event) => log.append(event));
  live.length = 0;
  live.push(...log.all());

  const result: NurseRoundResponse = Object.freeze({
    ok: true, requestId: input.requestId, patientId: input.patientId,
    eventIds: Object.freeze(eventIds), historyUpdated: true, duplicate: false,
  });
  requests.set(input.requestId, { fingerprint, response: result });
  return send(response, 201, result);
}

/**
 * Rank the whole ward at one moment.
 *
 * Shared by /api/ward and /api/patient/:id on purpose. A patient's rank is a
 * property of the ward, not of the patient, so computing it twice by two
 * routes would eventually produce two different answers for the same question.
 */
/**
 * The ward board: the ranked queue AND the trends each rank was derived from.
 *
 * wardQueue() already computed the trends and then dropped them on the floor,
 * so the ward screen could only show a status dot per bed and had to send the
 * reader to a side panel to learn anything. Returning both lets the floor plan
 * carry each patient's own trajectory without a second pass over the log --
 * which matters, because this runs for all eleven patients on every request.
 *
 * Nothing here is new intelligence. It is the same fold, kept instead of
 * discarded.
 */
function wardBoard(
  events: readonly Event[],
  now: Millis,
): { readonly queue: readonly PatientPriority[]; readonly trends: ReadonlyMap<string, PatientTrends> } {
  const inputs: PatientPriorityInput[] = [];
  const trendsById = new Map<string, PatientTrends>();
  for (const patientId of ALL_PATIENTS) {
    const view = patientHistory(events, loadRecord(patientId), now);
    if (view === undefined) continue; // a missing chart is a missing card
    const trends = patientTrend(view, now);
    trendsById.set(patientId, trends);
    const care = projectPatientCare(events, view, trends, now);
    inputs.push({
      patientId,
      trends,
      history: view,
      previousLevel: null,
      careGaps: care.gaps,
    });
  }
  return { queue: prioritize(inputs, now), trends: trendsById };
}

function wardQueue(events: readonly Event[], now: Millis): readonly PatientPriority[] {
  return wardBoard(events, now).queue;
}

/** Collect a JSON request body, with a cap so a bad client cannot exhaust memory. */
function readBody(request: IncomingMessage, then: (body: unknown) => void): void {
  const chunks: Buffer[] = [];
  let size = 0;
  request.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > 64_000) {
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => {
    try {
      then(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      then(null);
    }
  });
}

/** Collect one bounded binary microphone chunk. Corti's own per-chunk limit
 * is lower; the transport keeps a defensive cap before handing bytes over. */
function readBytes(
  request: IncomingMessage,
  limit: number,
  then: (body: Buffer | null, tooLarge: boolean) => void,
): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let rejected = false;
  request.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > limit) { rejected = true; return; }
    if (!rejected) chunks.push(chunk);
  });
  request.on("end", () => then(rejected ? null : Buffer.concat(chunks), rejected));
  request.on("error", () => then(null, false));
}

/**
 * A human's answer to a proposal.
 *
 * The proposal is re-derived from the ward rather than trusted from the client:
 * a request may name a proposal id, never assert what the proposal SAID. That
 * keeps the clinical claim on the server side of the boundary — a crafted
 * request cannot approve an action ECHO never proposed.
 */
function handleDecide(
  body: unknown,
  live: Event[],
  decisions: Map<string, { approved: boolean; eventId: EventId }>,
  clock: () => Millis,
  response: ServerResponse,
): void {
  const input = body as
    | { proposalId?: string; approved?: boolean; decidedBy?: string; note?: string; until?: number }
    | null;

  if (input?.proposalId === undefined || typeof input.approved !== "boolean") {
    return send(response, 400, { error: "proposalId and approved are required." });
  }
  const decidedBy = input.decidedBy ?? "Charge nurse";
  const moment = typeof input.until === "number" ? input.until : clock();

  void propose(wardQueue(live, moment), ROSTER, moment)
    .then((proposals) => {
      const proposal = proposals.find((p) => p.id === input.proposalId);
      if (proposal === undefined) {
        return send(response, 404, { error: `No live proposal ${input.proposalId}.` });
      }
      if (decisions.has(proposal.id)) {
        // Nothing a human accepted is silently reassigned, and nothing is
        // silently decided twice either.
        return send(response, 409, { error: "That proposal has already been decided." });
      }

      const decision = {
        proposalId: proposal.id,
        approved: input.approved as boolean,
        decidedBy,
        decidedAt: moment,
        ...(input.note === undefined ? {} : { note: input.note }),
      };
      const action = input.approved
        ? approve(proposal, decision, moment)
        : reject(proposal, decision, moment);

      const log = new EventLog();
      for (const event of live) log.append(event);
      const id = log.append(action);
      live.length = 0;
      live.push(...log.all());
      decisions.set(proposal.id, { approved: decision.approved, eventId: id });

      return send(response, 200, {
        ok: true,
        eventId: id,
        proposalId: proposal.id,
        approved: decision.approved,
        event: log.all().at(-1),
      });
    })
    .catch((e: Error) => send(response, 500, { error: e.message }));
}

/** The moment a request is asking about. Null when `until` was malformed. */
function momentFrom(url: URL, clock: () => Millis): Millis | null {
  const until = parseUntil(url.searchParams.get("until"));
  if (until === null) return null;
  return until ?? clock();
}

function badUntil(response: ServerResponse): void {
  send(response, 400, {
    error: "until must be a non-negative integer in milliseconds.",
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    // The UI lane builds against this from a different origin during the demo.
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

/** Extensions the built UI is allowed to serve. */
const STATIC_FILE = /\.(js|css|map|svg|png|jpg|jpeg|ico|webp|woff2?|json|txt)$/;

const CONTENT_TYPE: Readonly<Record<string, string>> = Object.freeze({
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
});

/** The Next static-export root. Every served file must resolve inside it. */
const ROOT = "web-next/out";
/** NUL, built rather than escaped so no toolchain can mangle the literal. */
const NUL = String.fromCharCode(0);

/**
 * Resolve a request path to a file inside the Next build, or null if it does
 * not stay there.
 *
 * THE DECODE IS THE WHOLE POINT. The App Router emits a chunk directory named
 * literally `[patientId]`, so the browser requests
 * `/_next/static/chunks/app/patients/%5BpatientId%5D/page-<hash>.js`. Joining
 * the raw pathname looked for a directory called `%5BpatientId%5D`, which does
 * not exist, so the chunk 404'd and /patients/<id>/ rendered as an empty
 * skeleton forever — the hero screen, blank, with only a console 404 to say so.
 *
 * Decoding first is also why the containment check has to come after it: a
 * crafted `%2e%2e%2f` only becomes `../` once decoded, so a guard applied to
 * the encoded form would be checking the wrong string.
 */
function buildPath(pathname: string, ...tail: readonly string[]): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // Malformed percent-encoding. Not a path we serve.
  }
  if (decoded.includes(NUL)) return null;
  const candidate = join(ROOT, decoded.replace(/^\//, ""), ...tail);
  const root = resolve(ROOT);
  const full = resolve(candidate);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return candidate;
}

function sendAsset(response: ServerResponse, path: string): void {
  const body = readFileSync(path);
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPE[extname(path)] ?? "application/octet-stream",
    "Content-Length": body.byteLength,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

/** Read a JSONL event log from disk. One event per line. */
export function readLog(path: string): readonly Event[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => Object.freeze(JSON.parse(line) as Event));
}

// --------------------------------------------------------------- entrypoint

if (process.argv[1]?.endsWith("index.ts")) {
  const port = Number(process.env.PORT ?? 8787);

  // The demo ward is BUILT, not read from a fixture file: simulation/ward.ts
  // is deterministic, so rebuilding it on boot gives byte-identical events
  // every time while staying editable without regenerating a JSONL by hand.
  // ECHO_LOG still overrides, for replaying a captured run.
  const logPath = process.env.ECHO_LOG;
  const log = new EventLog();
  if (logPath === undefined) {
    for (const input of wardEvents({ startTs: DEMO_T0, stepMs: DEMO_STEP_MS })) {
      log.append(input);
    }
  }
  const events = logPath === undefined ? log.all() : readLog(logPath);

  createServer({ events }).listen(port, () => {
    console.log(`echo ward server on http://localhost:${port}`);
    console.log(`  source: ${logPath ?? "simulation/ward (deterministic)"} (${events.length} events)`);
    console.log(`  demo t0: ${DEMO_T0}  step: ${DEMO_STEP_MS / 3_600_000}h`);
    console.log(`  ward:    GET /api/ward?until=<ms>`);
    console.log(`  patient: GET /api/patient/<id>?until=<ms>`);
    console.log(`  advance: until = t0 + n * step, n = 1..4`);
  });
}
