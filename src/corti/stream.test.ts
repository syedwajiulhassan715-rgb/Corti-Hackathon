import { test } from "node:test";
import assert from "node:assert/strict";

import {
  connectCortiStream,
  type StreamSocket,
  type StreamSocketConstructor,
} from "./stream.ts";

import type { CortiCredentials } from "./transcribe.ts";

class FakeSocket implements StreamSocket {
  static instances: FakeSocket[] = [];

  readonly url: string;
  readonly sent: (string | ArrayBuffer | ArrayBufferView)[] = [];

  readyState = 0;

  #listeners = new Map<string, Set<(...args: any[]) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (this.readyState !== 1) {
      throw new Error("socket is not open");
    }

    this.sent.push(data);
  }

  close(code = 1000, reason = ""): void {
    this.readyState = 3;
    this.#emit("close", { code, reason });
  }

  addEventListener(
    type: string,
    listener: (...args: any[]) => void,
  ): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: (...args: any[]) => void,
  ): void {
    this.#listeners.get(type)?.delete(listener);
  }

  open(): void {
    this.readyState = 1;
    this.#emit("open");
  }

  message(message: unknown): void {
    this.#emit("message", {
      data: JSON.stringify(message),
    });
  }

  error(): void {
    this.#emit("error", {});
  }

  #emit(type: string, ...args: any[]): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(...args);
    }
  }
}

const FakeWebSocket =
  FakeSocket as unknown as StreamSocketConstructor;

const credentials: CortiCredentials = {
  tenantName: "base",
  environment: "eu",
  getToken: async () => "test-token",
};

const configuration = {
  transcription: {
    primaryLanguage: "en",
    diarize: false,
    isMultichannel: false,
    participants: [
      {
        channel: 0,
        role: "multiple",
      },
    ],
  },
  mode: {
    type: "transcription" as const,
    outputLocale: "en",
  },
  retentionPolicy: "retain" as const,
  audioFormat: "audio/wav",
};

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitForSocket(
  index = 0,
): Promise<FakeSocket> {
  for (let i = 0; i < 100; i += 1) {
    const socket = FakeSocket.instances[index];

    if (socket !== undefined) {
      return socket;
    }

    await tick();
  }

  assert.fail(`FakeSocket ${index} was never created`);
}

test("connect waits for CONFIG_ACCEPTED", async () => {
  FakeSocket.instances.length = 0;

  const connection = connectCortiStream(
    {
      interactionId: "interaction-123",
      credentials,
      configuration,
    },
    {
      WebSocket: FakeWebSocket,
    },
  );

  const socket = await waitForSocket();

  assert.match(
    socket.url,
    /^wss:\/\/api\.eu\.corti\.app\/interactions\/interaction-123\/streams/,
  );

  const url = new URL(socket.url);

  assert.equal(
    url.searchParams.get("tenant-name"),
    "base",
  );

  assert.equal(
    url.searchParams.get("token"),
    "Bearer test-token",
  );

  socket.open();

  assert.equal(socket.sent.length, 1);

  assert.deepEqual(
    JSON.parse(String(socket.sent[0])),
    {
      type: "config",
      configuration,
    },
  );

  let resolved = false;

  void connection.then(() => {
    resolved = true;
  });

  await tick();

  assert.equal(resolved, false);

  socket.message({
    type: "CONFIG_ACCEPTED",
    sessionId: "session-123",
    configuration,
  });

  const stream = await connection;

  assert.equal(
    stream.interactionId,
    "interaction-123",
  );

  assert.equal(
    stream.sessionId,
    "session-123",
  );
});

test("audio can be sent after CONFIG_ACCEPTED", async () => {
  FakeSocket.instances.length = 0;

  const connection = connectCortiStream(
    {
      interactionId: "interaction-123",
      credentials,
      configuration,
    },
    {
      WebSocket: FakeWebSocket,
    },
  );

  const socket = await waitForSocket();

  socket.open();

  socket.message({
    type: "CONFIG_ACCEPTED",
    sessionId: "session-123",
    configuration,
  });

  const stream = await connection;

  const audio = new Uint8Array([1, 2, 3, 4]);

  stream.sendAudio(audio);

  assert.equal(socket.sent.length, 2);
  assert.equal(socket.sent[1], audio);
});

test("flush sends the Corti flush message", async () => {
  FakeSocket.instances.length = 0;

  const connection = connectCortiStream(
    {
      interactionId: "interaction-123",
      credentials,
      configuration,
    },
    {
      WebSocket: FakeWebSocket,
    },
  );

  const socket = await waitForSocket();

  socket.open();

  socket.message({
    type: "CONFIG_ACCEPTED",
    sessionId: "session-123",
    configuration,
  });

  const stream = await connection;

  stream.flush();

  assert.deepEqual(
    JSON.parse(String(socket.sent.at(-1))),
    { type: "flush" },
  );
});

test("end sends the Corti end message", async () => {
  FakeSocket.instances.length = 0;

  const connection = connectCortiStream(
    {
      interactionId: "interaction-123",
      credentials,
      configuration,
    },
    {
      WebSocket: FakeWebSocket,
    },
  );

  const socket = await waitForSocket();

  socket.open();

  socket.message({
    type: "CONFIG_ACCEPTED",
    sessionId: "session-123",
    configuration,
  });

  const stream = await connection;

  stream.end();

  assert.deepEqual(
    JSON.parse(String(socket.sent.at(-1))),
    { type: "end" },
  );
});

test("messages are delivered to registered handlers", async () => {
  FakeSocket.instances.length = 0;

  const connection = connectCortiStream(
    {
      interactionId: "interaction-123",
      credentials,
      configuration,
    },
    {
      WebSocket: FakeWebSocket,
    },
  );

  const socket = await waitForSocket();

  socket.open();

  socket.message({
    type: "CONFIG_ACCEPTED",
    sessionId: "session-123",
    configuration,
  });

  const stream = await connection;

  const received: unknown[] = [];

  stream.onMessage((message) => {
    received.push(message);
  });

  socket.message({
    type: "transcript",
    data: [
      {
        id: "segment-1",
        transcript: "Patient has chest pain.",
        time: {
          start: 1.2,
          end: 2.3,
        },
        final: true,
        speakerId: 0,
        participant: {
          channel: 0,
        },
      },
    ],
  });

  assert.equal(received.length, 1);

  assert.equal(
    (received[0] as { type: string }).type,
    "transcript",
  );
});

test("configuration denial rejects the connection", async () => {
  FakeSocket.instances.length = 0;

  const connection = connectCortiStream(
    {
      interactionId: "interaction-123",
      credentials,
      configuration,
    },
    {
      WebSocket: FakeWebSocket,
    },
  );

  const socket = await waitForSocket();

  socket.open();

  socket.message({
    type: "CONFIG_DENIED",
    reason: "Invalid configuration",
  });

  await assert.rejects(
    connection,
    /Corti stream configuration failed: CONFIG_DENIED — Invalid configuration/,
  );
});

test("connection errors are retried", async () => {
  FakeSocket.instances.length = 0;

  let sleeps = 0;

  const connection = connectCortiStream(
    {
      interactionId: "interaction-123",
      credentials,
      configuration,
      connectionAttempts: 3,
    },
    {
      WebSocket: FakeWebSocket,
      sleep: async () => {
        sleeps += 1;
      },
    },
  );

  const first = await waitForSocket(0);

  first.error();

  const second = await waitForSocket(1);

  second.error();

  const third = await waitForSocket(2);

  third.open();

  third.message({
    type: "CONFIG_ACCEPTED",
    sessionId: "session-123",
    configuration,
  });

  const stream = await connection;

  assert.equal(
    stream.sessionId,
    "session-123",
  );

  assert.equal(sleeps, 2);
});

test("a provided websocketUrl is preserved", async () => {
  FakeSocket.instances.length = 0;

  const providedUrl =
    "wss://api.eu.corti.app/interactions/interaction-123/streams?tenant-name=base";

  const connection = connectCortiStream(
    {
      interactionId: "interaction-123",
      credentials,
      configuration,
      websocketUrl: providedUrl,
    },
    {
      WebSocket: FakeWebSocket,
    },
  );

  const socket = await waitForSocket();

  assert.match(
    socket.url,
    /^wss:\/\/api\.eu\.corti\.app\/interactions\/interaction-123\/streams/,
  );

  const url = new URL(socket.url);

  assert.equal(
    url.searchParams.get("tenant-name"),
    "base",
  );

  assert.equal(
    url.searchParams.get("token"),
    "Bearer test-token",
  );

  socket.open();

  socket.message({
    type: "CONFIG_ACCEPTED",
    sessionId: "session-123",
    configuration,
  });

  await connection;
});