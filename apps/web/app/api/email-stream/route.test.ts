vi.mock("server-only", () => ({}));

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SafeError } from "@/utils/error";

const { cleanerEnv, mockGetEmailAccount, subscriberState } = vi.hoisted(() => {
  const listeners = new Map<
    string,
    Set<(...args: [string, string, string]) => void>
  >();

  const getListeners = (event: string) => {
    let eventListeners = listeners.get(event);

    if (!eventListeners) {
      eventListeners = new Set();
      listeners.set(event, eventListeners);
    }

    return eventListeners;
  };

  const subscriber = {
    psubscribe: vi.fn(
      (_pattern: string, callback?: (error: Error | null) => void) => {
        callback?.(null);
      },
    ),
    punsubscribe: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(
      (
        event: string,
        listener: (...args: [string, string, string]) => void,
      ) => {
        getListeners(event).add(listener);
        return subscriber;
      },
    ),
    off: vi.fn(
      (
        event: string,
        listener: (...args: [string, string, string]) => void,
      ) => {
        listeners.get(event)?.delete(listener);
        return subscriber;
      },
    ),
  };

  return {
    cleanerEnv: {
      NEXT_PUBLIC_CLEANER_ENABLED: true,
    },
    mockGetEmailAccount: vi.fn(),
    subscriberState: {
      subscriber,
      emit(event: string, ...args: [string, string, string]) {
        for (const listener of listeners.get(event) ?? []) {
          listener(...args);
        }
      },
      listenerCount(event: string) {
        return listeners.get(event)?.size ?? 0;
      },
      reset() {
        listeners.clear();
        subscriber.psubscribe.mockClear();
        subscriber.punsubscribe.mockClear();
        subscriber.disconnect.mockClear();
        subscriber.on.mockClear();
        subscriber.off.mockClear();
      },
    },
  };
});

vi.mock("@/env", () => ({
  env: cleanerEnv,
}));

vi.mock("@/utils/middleware", () => ({
  withAuth:
    (
      _scope: string,
      handler: (
        request: NextRequest & {
          auth: { userId: string };
          logger: typeof mockLogger;
        },
      ) => Promise<Response>,
    ) =>
    async (request: NextRequest) => {
      const authRequest = request as NextRequest & {
        auth: { userId: string };
        logger: typeof mockLogger;
      };

      authRequest.auth = { userId: "user-1" };
      authRequest.logger = mockLogger;

      try {
        return await handler(authRequest);
      } catch (error) {
        if (error instanceof SafeError) {
          return NextResponse.json(
            { error: error.safeMessage, isKnownError: true },
            { status: error.statusCode ?? 400 },
          );
        }

        throw error;
      }
    },
}));

vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: (...args: unknown[]) => mockGetEmailAccount(...args),
}));

vi.mock("@/utils/redis/subscriber", () => ({
  RedisSubscriber: {
    createInstance: () => subscriberState.subscriber,
  },
}));

import { GET } from "./route";

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
};

describe("email-stream route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanerEnv.NEXT_PUBLIC_CLEANER_ENABLED = true;
    subscriberState.reset();
    mockGetEmailAccount.mockImplementation(
      async ({ emailAccountId }: { emailAccountId: string }) => ({
        id: emailAccountId,
      }),
    );
  });

  it("only streams thread events for the authenticated email account", async () => {
    const responseA = await GET(createRequest("account-a"));
    const responseB = await GET(createRequest("account-b"));

    const readA = readThreadEvent(responseA);
    const readB = readThreadEvent(responseB);

    subscriberState.emit(
      "pmessage",
      "thread:account-a:*",
      "thread:account-a:thread-1",
      JSON.stringify({ id: "message-a" }),
    );
    subscriberState.emit(
      "pmessage",
      "thread:account-b:*",
      "thread:account-b:thread-1",
      JSON.stringify({ id: "message-b" }),
    );

    expect(await readA).toContain('"message-a"');
    expect(await readB).toContain('"message-b"');
  });

  it("removes the Redis listener when the request is aborted", async () => {
    const abortController = new AbortController();
    const response = await GET(createRequest("account-a", abortController));
    const reader = response.body?.getReader();

    expect(reader).toBeDefined();
    expect(subscriberState.listenerCount("pmessage")).toBe(1);

    abortController.abort();
    await Promise.resolve();

    expect(await reader?.read()).toEqual({ done: true, value: undefined });
    expect(subscriberState.listenerCount("pmessage")).toBe(0);
  });

  it("returns a not found error when cleaner is disabled on self-hosted", async () => {
    cleanerEnv.NEXT_PUBLIC_CLEANER_ENABLED = false;

    const response = await GET(createRequest("account-a"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Cleaner is not enabled",
      isKnownError: true,
    });
    expect(subscriberState.subscriber.psubscribe).not.toHaveBeenCalled();
  });
});

function createRequest(
  emailAccountId: string,
  abortController = new AbortController(),
) {
  return new NextRequest(
    `http://localhost:3000/api/email-stream?emailAccountId=${emailAccountId}`,
    { signal: abortController.signal },
  );
}

async function readThreadEvent(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) throw new Error("Expected SSE response body");

  const chunk = await reader.read();

  if (chunk.done || !chunk.value) throw new Error("Expected SSE event chunk");

  return new TextDecoder().decode(chunk.value);
}
