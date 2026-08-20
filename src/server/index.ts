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

import { createServer as createHttpServer, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

import type { Event, Millis } from "../contracts/index.ts";
import { ward, type RoomCard } from "../projections/ward.ts";

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

  return createHttpServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method !== "GET") {
      return send(response, 405, { error: "Only GET is supported." });
    }

    // The demo surface. One page, served from disk so it cannot drift from
    // the log it is describing, and /log so it can show the pipeline itself
    // rather than only the card the pipeline produced.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return sendHtml(response, readFileSync("web/index.html", "utf8"));
    }

    if (url.pathname === "/log") {
      return send(response, 200, { events: options.events });
    }

    if (url.pathname === "/health") {
      return send(response, 200, { ok: true, events: options.events.length });
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
    return send(response, 200, wardResponse(options.events, moment, until !== undefined));
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
  const logPath = process.env.ECHO_LOG ?? "fixtures/events/ward.demo.jsonl";
  const port = Number(process.env.PORT ?? 8787);
  const events = readLog(logPath);

  createServer({ events }).listen(port, () => {
    console.log(`echo ward server on http://localhost:${port}`);
    console.log(`  log:   ${logPath} (${events.length} events)`);
    console.log(`  live:  GET /ward`);
    console.log(`  scrub: GET /ward?until=<ms>`);
  });
}
