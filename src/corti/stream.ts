// S1 Corti /streams WebSocket transport.
//
// Owns only the Corti WebSocket connection:
//   connect -> CONFIG_ACCEPTED -> audio/messages -> flush/end -> close
//
// The pipeline does not know about WebSocket details. It receives typed
// Corti messages through the StreamHandle.
//
// Corti requires:
//   - a valid interaction id
//   - tenant-name
//   - Bearer access token
//   - config within 10 seconds of opening
//   - CONFIG_ACCEPTED before audio is sent
//
// See:
// https://docs.corti.ai/api-reference/streams

import type { CortiCredentials } from "./transcribe.ts";

export interface StreamParticipant {
  readonly channel: number;
  readonly role: string;
}

export interface StreamConfiguration {
  readonly transcription: {
    readonly primaryLanguage: string;
    readonly isDiarization?: boolean;
    readonly isMultichannel?: boolean;
    readonly participants?: readonly StreamParticipant[];
  };
  readonly mode: {
    readonly type: "facts" | "transcription";
    readonly outputLocale: string;
  };
  readonly retentionPolicy?: "retain" | "none";
  readonly audioFormat?: string;
  readonly audioEvents?: {
    readonly enabled: boolean;
  };
  readonly factGenerationInterval?: "fixed" | "fast_init";
  readonly replacements?: readonly {
    readonly find: string;
    readonly replace: string;
  }[];
  readonly keyterms?: {
    readonly terms: readonly {
      readonly term: string;
    }[];
  };
}

export interface CortiStreamMessage {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface CortiTranscriptMessage extends CortiStreamMessage {
  readonly type: "transcript";
  readonly data: readonly {
    readonly id: string;
    readonly transcript: string;
    readonly time: {
      readonly start: number;
      readonly end: number;
    };
    readonly final: boolean;
    readonly speakerId: number;
    readonly participant: {
      readonly channel: number;
    };
  }[];
}

export interface CortiFactsMessage extends CortiStreamMessage {
  readonly type: "facts";
  readonly facts: readonly {
    readonly id: string;
    readonly text: string;
    readonly group: string;
    readonly groupId?: string;
    readonly isDiscarded: boolean;
    readonly source: string;
    readonly createdAt: string;
    readonly updatedAt: string | null;
  }[];
}

export interface CortiErrorMessage extends CortiStreamMessage {
  readonly type: "error";
  readonly error: {
    readonly id?: string;
    readonly title?: string;
    readonly status?: number;
    readonly details?: string;
    readonly doc?: string;
  };
}

export interface CortiConfigAcceptedMessage extends CortiStreamMessage {
  readonly type: "CONFIG_ACCEPTED";
  /** Documented by Corti, but some accepted production handshakes omit it.
   * CONFIG_ACCEPTED itself remains the protocol readiness boundary. */
  readonly sessionId?: string;
  readonly configuration?: StreamConfiguration;
}

export interface CortiConfigDeniedMessage extends CortiStreamMessage {
  readonly type:
    | "CONFIG_DENIED"
    | "CONFIG_NOT_PROVIDED"
    | "CONFIG_ALREADY_RECEIVED"
    | "CONFIG_MISSING";
  readonly reason?: string;
}

export interface CortiUsageMessage extends CortiStreamMessage {
  readonly type: "usage" | "delta_usage";
  readonly credits: number;
}

export interface CortiEndedMessage extends CortiStreamMessage {
  readonly type: "ENDED";
}

export interface CortiFlushedMessage extends CortiStreamMessage {
  readonly type: "flushed";
}

export type CortiStreamSocketMessage =
  | CortiConfigAcceptedMessage
  | CortiConfigDeniedMessage
  | CortiTranscriptMessage
  | CortiFactsMessage
  | CortiErrorMessage
  | CortiUsageMessage
  | CortiEndedMessage
  | CortiFlushedMessage
  | CortiStreamMessage;

export interface StreamSocket {
  readonly readyState: number;

  send(data: string | ArrayBuffer | ArrayBufferView): void;

  close(code?: number, reason?: string): void;

  addEventListener(
    type: "open",
    listener: () => void,
  ): void;

  addEventListener(
    type: "message",
    listener: (event: { readonly data: unknown }) => void,
  ): void;

  addEventListener(
    type: "error",
    listener: (event: unknown) => void,
  ): void;

  addEventListener(
    type: "close",
    listener: (event: {
      readonly code: number;
      readonly reason: string;
    }) => void,
  ): void;

  removeEventListener?(
    type: string,
    listener: (...args: any[]) => void,
  ): void;
}

export interface StreamSocketConstructor {
  new (url: string): StreamSocket;
}

export interface CortiStreamDeps {
  /**
   * Injectable for tests. Defaults to Node's global WebSocket.
   */
  readonly WebSocket?: StreamSocketConstructor;

  /**
   * Optional sleep seam for retry tests.
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface CortiStreamConnectRequest {
  readonly interactionId: string;
  readonly credentials: CortiCredentials;
  readonly configuration: StreamConfiguration;

  /**
   * If the interaction-create response supplied websocketUrl, pass it here.
   * This is preferred because Corti owns the exact stream URL.
   */
  readonly websocketUrl?: string;

  /**
   * Number of connection attempts for transient connection failures.
   * Defaults to 3.
   */
  readonly connectionAttempts?: number;
}

export interface StreamHandle {
  readonly interactionId: string;
  readonly sessionId: string | null;

  /**
   * Send raw audio bytes.
   *
   * Corti recommends roughly 250–500 ms chunks and limits a chunk to
   * 64,000 bytes. This method deliberately does not chunk data itself.
   */
  sendAudio(audio: ArrayBuffer | ArrayBufferView): void;

  /**
   * Ask Corti to flush currently buffered audio.
   */
  flush(): void;

  /**
   * End the Corti stream.
   */
  end(): void;

  /**
   * Register a handler for server messages.
   */
  onMessage(handler: (message: CortiStreamSocketMessage) => void): () => void;

  /** Observe the transport closing after a successful handshake. */
  onClose(handler: (event: { readonly code: number; readonly reason: string }) => void): () => void;

  /**
   * Close locally without sending an `end` message.
   */
  close(code?: number, reason?: string): void;
}

const OPEN = 1;

const DEFAULT_CONNECTION_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 500];

export async function connectCortiStream(
  request: CortiStreamConnectRequest,
  deps: CortiStreamDeps = {},
): Promise<StreamHandle> {
  const WebSocketImpl =
    deps.WebSocket ??
    (globalThis.WebSocket as unknown as StreamSocketConstructor | undefined);

  if (WebSocketImpl === undefined) {
    throw new Error(
      "WebSocket is unavailable. This implementation requires Node 22+ " +
        "or an injected WebSocket constructor.",
    );
  }

  const sleep =
    deps.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const attempts = Math.max(
    1,
    request.connectionAttempts ?? DEFAULT_CONNECTION_ATTEMPTS,
  );

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    return await connectOnce(request, WebSocketImpl);
  } catch (error) {
    lastError = error;

    // Configuration failures are deterministic and must not be retried.
    // Retrying CONFIG_DENIED would create a new socket, which then waits
    // for configuration until the timeout.
    if (isNonRetryableConfigurationError(error)) {
      break;
    }

    if (attempt === attempts) {
      break;
    }

    await sleep(
      RETRY_DELAYS_MS[
        Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)
      ],
    );
  }
}

  throw lastError instanceof Error
    ? lastError
    : new Error(
        `Corti stream connection failed: ${String(lastError)}`,
      );
}

async function connectOnce(
  request: CortiStreamConnectRequest,
  WebSocketImpl: StreamSocketConstructor,
): Promise<StreamHandle> {
  const token = await request.credentials.getToken();

  const url = buildStreamUrl(request, token);

  const socket = new WebSocketImpl(url);

  const messages = new Set<
    (message: CortiStreamSocketMessage) => void
  >();
  const closes = new Set<(event: { readonly code: number; readonly reason: string }) => void>();
  let closed: { readonly code: number; readonly reason: string } | null = null;

  const sessionId = await waitForConfiguration(
    socket,
    request.configuration,
  );

  /*
   * The configuration handshake is now complete.
   *
   * From this point onward, all server messages are handled by this
   * dedicated listener. This is deliberately separate from the
   * CONFIG_ACCEPTED handshake listener so that messages arriving after
   * connection establishment are always delivered to onMessage handlers.
   */
  const handleMessage = (
    event: { readonly data: unknown },
  ): void => {
    const message = parseMessage(event.data);

    for (const handler of messages) {
      handler(message);
    }
  };

  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", (event) => {
    closed = Object.freeze({ code: event.code, reason: event.reason });
    for (const handler of closes) handler(closed);
  });

  return {
    interactionId: request.interactionId,
    sessionId,

    sendAudio(audio): void {
      if (socket.readyState !== OPEN) {
        throw new Error("Corti stream is not open");
      }

      socket.send(audio);
    },

    flush(): void {
      if (socket.readyState !== OPEN) {
        throw new Error("Corti stream is not open");
      }

      socket.send(JSON.stringify({ type: "flush" }));
    },

    end(): void {
      if (socket.readyState !== OPEN) {
        return;
      }

      socket.send(JSON.stringify({ type: "end" }));
    },

    onMessage(handler): () => void {
      messages.add(handler);

      return () => {
        messages.delete(handler);
      };
    },

    onClose(handler): () => void {
      closes.add(handler);
      if (closed !== null) handler(closed);
      return () => closes.delete(handler);
    },

    close(code, reason): void {
      socket.close(code, reason);
    },
  };
}

async function waitForConfiguration(
  socket: StreamSocket,
  configuration: StreamConfiguration,
): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (
      callback: () => void,
    ): void => {
      if (finished) {
        return;
      }

      finished = true;

      if (timer !== undefined) {
        clearTimeout(timer);
      }

      if (socket.removeEventListener) {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("close", handleClose);
      }

      callback();
    };

    const fail = (error: Error): void => {
      finish(() => {
        socket.close();
        reject(error);
      });
    };

    const handleOpen = (): void => {
      socket.send(
        JSON.stringify({
          type: "config",
          configuration,
        }),
      );
    };

    const handleMessage = (
      event: { readonly data: unknown },
    ): void => {
      let message: CortiStreamSocketMessage;

      try {
        message = parseMessage(event.data);
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error(
                `Invalid Corti WebSocket message: ${String(error)}`,
              ),
        );
        return;
      }

      if (message.type === "CONFIG_ACCEPTED") {
        const accepted =
          message as CortiConfigAcceptedMessage;

        finish(() => resolve(accepted.sessionId ?? null));
        return;
      }

      if (
        message.type === "CONFIG_DENIED" ||
        message.type === "CONFIG_NOT_PROVIDED" ||
        message.type === "CONFIG_ALREADY_RECEIVED" ||
        message.type === "CONFIG_MISSING"
      ) {
        const denied =
          message as CortiConfigDeniedMessage;

        fail(
          new Error(
            `Corti stream configuration failed: ${message.type}` +
              (denied.reason
                ? ` — ${denied.reason}`
                : ""),
          ),
        );
        return;
      }

      if (message.type === "error") {
        const error =
          message as CortiErrorMessage;

        fail(
          new Error(
            "Corti stream error during configuration" +
              (error.error?.title
                ? `: ${error.error.title}`
                : "") +
              (error.error?.details
                ? ` — ${error.error.details}`
                : ""),
          ),
        );
      }
    };

    const handleError = (): void => {
      fail(
        new Error("Corti WebSocket connection failed"),
      );
    };

    const handleClose = (event: {
      readonly code: number;
      readonly reason: string;
    }): void => {
      if (finished) {
        return;
      }

      fail(
        new Error(
          "Corti WebSocket closed before configuration was accepted: " +
            `${event.code}` +
            (event.reason
              ? ` ${event.reason}`
              : ""),
        ),
      );
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);

    // Corti requires configuration within 10 seconds of opening.
    timer = setTimeout(() => {
      fail(
        new Error(
          "Corti stream configuration timed out after 10 seconds",
        ),
      );
    }, 9_000);
  });
}

function isNonRetryableConfigurationError(
  error: unknown,
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.startsWith(
      "Corti stream configuration failed:",
    ) ||
    error.message.startsWith(
      "Corti stream error during configuration",
    )
  );
}

function buildStreamUrl(
  request: CortiStreamConnectRequest,
  token: string,
): string {
  const rawUrl =
    request.websocketUrl ??
    `wss://api.${request.credentials.environment}.corti.app/interactions/` +
      `${encodeURIComponent(request.interactionId)}/streams`;

  const url = new URL(rawUrl);

  if (!url.searchParams.has("tenant-name")) {
    url.searchParams.set(
      "tenant-name",
      request.credentials.tenantName,
    );
  }

  url.searchParams.set(
    "token",
    `Bearer ${token}`,
  );

  return url.toString();
}

function parseMessage(
  data: unknown,
): CortiStreamSocketMessage {
  if (typeof data === "string") {
    return JSON.parse(
      data,
    ) as CortiStreamSocketMessage;
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(
      new TextDecoder().decode(data),
    ) as CortiStreamSocketMessage;
  }

  throw new Error(
    `Unexpected Corti WebSocket message type: ` +
      `${Object.prototype.toString.call(data)}`,
  );
}
