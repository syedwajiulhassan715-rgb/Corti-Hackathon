// Tests for the disk cache and the transcribe step.
//
// Every test runs offline. The warm-cache tests read the real sample_17
// response recorded during V1, and pass a fetch that throws if it is ever
// reached — a network call in this suite is a test failure, not a slow test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DiskCache } from "./cache.ts";
import { transcribe, segmentToEvent, type CortiTranscript } from "./transcribe.ts";
import { EventLog } from "../log/store.ts";

const TRANSCRIPTS = join(import.meta.dirname, "../../fixtures/provided/transcripts");
const SAMPLE_17 = "sample_17_en.transcript";
const AUDIO = "fixtures/provided/audio/sample_17_en.wav";

/** Any call to this is a bug: the suite must never leave the machine. */
const offline: typeof globalThis.fetch = () => {
  throw new Error("network call attempted in an offline test");
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "echo-cache-"));
}

// ---------------------------------------------------------------- cache

test("cache returns the stored value on a hit without calling", async () => {
  const cache = new DiskCache({ dir: TRANSCRIPTS });
  const hit = await cache.through<CortiTranscript>(SAMPLE_17, async () => {
    throw new Error("must not be called on a hit");
  });
  assert.equal(hit.status, "completed");
  assert.equal(hit.transcripts.length, 1);
});

test("cache calls and stores on a miss, then serves the stored copy", async () => {
  const dir = scratch();
  const cache = new DiskCache({ dir });
  let calls = 0;

  const first = await cache.through("thing", async () => {
    calls += 1;
    return { value: 42 };
  });
  const second = await cache.through("thing", async () => {
    calls += 1;
    return { value: 99 };
  });

  assert.equal(calls, 1, "the second read must not call");
  assert.deepEqual(first, { value: 42 });
  assert.deepEqual(second, { value: 42 });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "thing.json"), "utf8")), { value: 42 });
  rmSync(dir, { recursive: true });
});

test("cache survives a restart — a new instance sees the same entry", async () => {
  const dir = scratch();
  await new DiskCache({ dir }).through("k", async () => ({ v: 1 }));
  const reopened = await new DiskCache({ dir }).through("k", async () => {
    throw new Error("must not be called");
  });
  assert.deepEqual(reopened, { v: 1 });
  rmSync(dir, { recursive: true });
});

test("cache reports misses and hits", () => {
  const cache = new DiskCache({ dir: TRANSCRIPTS });
  assert.equal(cache.has(SAMPLE_17), true);
  assert.equal(cache.has("never_fetched"), false);
  assert.equal(cache.read("never_fetched"), undefined);
});

test("cache rejects a key that would escape the directory", () => {
  const cache = new DiskCache({ dir: scratch() });
  for (const bad of ["../escape", "a/b", "a\\b", "with space"]) {
    assert.throws(() => cache.path(bad), /Unsafe cache key/);
  }
});

// ----------------------------------------------------------- transcribe

test("transcribe maps the cached sample_17 response onto speech events", async () => {
  const log = new EventLog();
  const events = await transcribe(
    { audioPath: AUDIO, room: "room-1", startedAt: 100_000 },
    { append: (e) => log.append(e), cache: new DiskCache({ dir: TRANSCRIPTS }), fetch: offline },
  );

  assert.equal(events.length, 1, "sample_17 is one dictated segment");
  const [event] = events;
  assert.equal(event.source, "speech");
  assert.equal(event.speaker, "unknown");
  assert.equal(event.room, "room-1");
  assert.equal(event.code, null);
  assert.equal(event.value, null);
  assert.ok(event.quote.startsWith("Reason for consultation"));
  assert.ok(event.quote.length > 1000);
});

test("ts is the recording offset added to startedAt", async () => {
  const log = new EventLog();
  const events = await transcribe(
    { audioPath: AUDIO, room: "room-1", startedAt: 1_000_000 },
    { append: (e) => log.append(e), cache: new DiskCache({ dir: TRANSCRIPTS }), fetch: offline },
  );
  // sample_17's only segment starts at 1632 ms into the recording.
  assert.equal(events[0].ts, 1_000_000 + 1632);
});

test("transcribe appends through the injected append and returns the ids it got", async () => {
  const log = new EventLog();
  const appended: string[] = [];
  const events = await transcribe(
    { audioPath: AUDIO, room: "room-2", startedAt: 0 },
    {
      append: (e) => {
        const id = log.append(e);
        appended.push(id);
        return id;
      },
      cache: new DiskCache({ dir: TRANSCRIPTS }),
      fetch: offline,
    },
  );

  assert.deepEqual(events.map((e) => e.id), appended);
  assert.equal(log.size, 1);
  assert.equal(log.byId(events[0].id)?.quote, events[0].quote);
});

test("the default cache key is derived from the audio filename", async () => {
  const log = new EventLog();
  const events = await transcribe(
    { audioPath: "some/other/dir/sample_17_en.wav", room: "room-1", startedAt: 0 },
    { append: (e) => log.append(e), cache: new DiskCache({ dir: TRANSCRIPTS }), fetch: offline },
  );
  assert.equal(events.length, 1, "resolved sample_17_en.transcript from the filename alone");
});

test("a multi-segment transcript becomes one event per segment, in order", async () => {
  const dir = scratch();
  const cache = new DiskCache({ dir });
  cache.write("two_voices.transcript", {
    id: "t1",
    recordingId: "r1",
    status: "completed",
    transcripts: [
      { channel: 0, participant: 0, speakerId: 0, text: "Where is the pain?", start: 1000, end: 2000 },
      { channel: 0, participant: 1, speakerId: 1, text: "Across my chest.", start: 2500, end: 3400 },
    ],
  } satisfies CortiTranscript);

  const log = new EventLog();
  const events = await transcribe(
    { audioPath: "two_voices.wav", room: "room-3", startedAt: 50_000, cacheKey: "two_voices.transcript" },
    { append: (e) => log.append(e), cache, fetch: offline },
  );

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.ts), [51_000, 52_500]);
  assert.deepEqual(events.map((e) => e.quote), ["Where is the pain?", "Across my chest."]);
  assert.deepEqual(
    events.map((e) => e.speaker),
    ["unknown", "unknown"],
    "speakerId 0 and 1 must not become roles here — that is roles.ts",
  );
  rmSync(dir, { recursive: true });
});

test("a cache miss without credentials refuses to call rather than failing at the socket", async () => {
  const dir = scratch();
  const log = new EventLog();
  await assert.rejects(
    transcribe(
      { audioPath: "nothing.wav", room: "room-1", startedAt: 0 },
      { append: (e) => log.append(e), cache: new DiskCache({ dir }), fetch: offline },
    ),
    /Cache miss for nothing.transcript and no credentials/,
  );
  assert.equal(log.size, 0, "nothing is appended when the transcript never arrived");
  rmSync(dir, { recursive: true });
});

test("segmentToEvent is pure — same segment, same event, no clock", () => {
  const segment = { channel: 0, participant: 0, speakerId: 0, text: "Hello.", start: 10, end: 20 };
  const first = segmentToEvent(segment, "room-1", 5);
  const second = segmentToEvent(segment, "room-1", 5);
  assert.deepEqual(first, second);
  assert.equal(first.ts, 15);
});

test("a warm cache means no credentials are needed at all", async () => {
  const log = new EventLog();
  const events = await transcribe(
    { audioPath: AUDIO, room: "room-1", startedAt: 0 },
    { append: (e) => log.append(e), cache: new DiskCache({ dir: TRANSCRIPTS }), fetch: offline },
  );
  assert.equal(events.length, 1);
});

test("the cached V1 response on disk is the one the demo will replay", () => {
  const cache = new DiskCache({ dir: TRANSCRIPTS });
  const transcript = cache.read<CortiTranscript>(SAMPLE_17);
  assert.ok(transcript);
  assert.equal(transcript.transcripts[0].start, 1632);
  assert.equal(transcript.transcripts[0].end, 209_346);
  assert.equal(transcript.transcripts[0].speakerId, 0);
});

test("cache.write then read round-trips a transcript unchanged", () => {
  const dir = scratch();
  const cache = new DiskCache({ dir });
  const original = JSON.parse(readFileSync(join(TRANSCRIPTS, `${SAMPLE_17}.json`), "utf8"));
  cache.write("copy", original);
  assert.deepEqual(cache.read("copy"), original);
  rmSync(dir, { recursive: true });
});

test("a corrupt cache file surfaces as an error, not as silent bad data", () => {
  const dir = scratch();
  writeFileSync(join(dir, "broken.json"), "{ not json", "utf8");
  assert.throws(() => new DiskCache({ dir }).read("broken"));
  rmSync(dir, { recursive: true });
});
