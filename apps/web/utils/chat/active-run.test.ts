import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { getChatStreamContext, startChatRun, stopChatRun } from "./active-run";

const { envState, redisInstances } = vi.hoisted(() => ({
  envState: { REDIS_URL: undefined as string | undefined },
  redisInstances: [] as Array<{
    listeners: Map<string, (...args: string[]) => void>;
    subscriptions: Set<string>;
    publish: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@/env", () => ({ env: envState }));

vi.mock("@/utils/prisma");

vi.mock("resumable-stream/ioredis", () => ({
  createResumableStreamContext: vi.fn(() => ({ name: "stream-context" })),
}));

// Every fake connection shares one bus, the way separate server instances
// share one Redis.
vi.mock("ioredis", () => ({
  default: class FakeRedis {
    listeners = new Map<string, (...args: string[]) => void>();
    subscriptions = new Set<string>();
    publish = vi.fn(async (channel: string, message: string) => {
      for (const instance of redisInstances) {
        if (instance.subscriptions.has(channel)) {
          instance.listeners.get("message")?.(channel, message);
        }
      }
      return 1;
    });

    constructor() {
      redisInstances.push(this);
    }

    on(event: string, listener: (...args: string[]) => void) {
      this.listeners.set(event, listener);
      return this;
    }

    async subscribe(channel: string) {
      this.subscriptions.add(channel);
      return 1;
    }
  },
}));

const logger = createScopedLogger("active-run-test");

describe("assistant chat runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.REDIS_URL = undefined;
    redisInstances.length = 0;
    global.assistantChatRedis = undefined;
    global.assistantChatRuns?.clear();
  });

  it("skips resumable streams when Redis is not configured", () => {
    expect(getChatStreamContext()).toBeNull();
  });

  it("stops a run on the same instance without Redis", async () => {
    const run = startChatRun("stream-1");

    await stopChatRun("stream-1", logger);

    expect(run.abortSignal.aborted).toBe(true);
  });

  it("aborts a run when another instance broadcasts its stop", async () => {
    envState.REDIS_URL = "redis://localhost:6379";
    const run = startChatRun("stream-1");
    const otherRun = startChatRun("stream-2");
    const subscriber = redisInstances.find((instance) =>
      instance.subscriptions.has("assistant-chat:stop"),
    );

    // Another instance publishes through its own connection.
    subscriber?.listeners.get("message")?.("assistant-chat:stop", "stream-1");

    expect(run.abortSignal.aborted).toBe(true);
    expect(otherRun.abortSignal.aborted).toBe(false);
  });

  it("broadcasts stops so the instance that owns the run can abort it", async () => {
    envState.REDIS_URL = "redis://localhost:6379";

    await stopChatRun("stream-elsewhere", logger);

    const publishes = redisInstances.flatMap(
      (instance) => instance.publish.mock.calls,
    );
    expect(publishes).toEqual([["assistant-chat:stop", "stream-elsewhere"]]);
  });

  it("ignores stops after the run has ended", async () => {
    envState.REDIS_URL = "redis://localhost:6379";
    const run = startChatRun("stream-1");
    run.end();

    await stopChatRun("stream-1", logger);

    expect(run.abortSignal.aborted).toBe(false);
  });
});
