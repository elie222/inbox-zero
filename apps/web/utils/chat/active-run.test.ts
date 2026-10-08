import Redis from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  claimActiveStream,
  clearActiveStream,
  getChatStreamContext,
  getLiveStreamId,
  startChatRun,
  stopChatRun,
} from "./active-run";

const { envState, redisBus } = vi.hoisted(() => ({
  envState: { REDIS_URL: undefined as string | undefined },
  redisBus: {
    instances: [] as Array<{
      listeners: Map<string, (...args: string[]) => void>;
      subscriptions: Set<string>;
    }>,
    // Lets a test hold a subscription open to simulate a slow Redis.
    subscribeGate: null as Promise<void> | null,
  },
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

    constructor() {
      redisBus.instances.push(this);
    }

    on(event: string, listener: (...args: string[]) => void) {
      this.listeners.set(event, listener);
      return this;
    }

    async subscribe(channel: string) {
      await redisBus.subscribeGate;
      this.subscriptions.add(channel);
      return 1;
    }

    async publish(channel: string, message: string) {
      for (const instance of redisBus.instances) {
        if (instance.subscriptions.has(channel)) {
          instance.listeners.get("message")?.(channel, message);
        }
      }
      return 1;
    }
  },
}));

const logger = createScopedLogger("active-run-test");

describe("assistant chat runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.REDIS_URL = undefined;
    redisBus.instances.length = 0;
    redisBus.subscribeGate = null;
    global.assistantChatRedis = undefined;
    global.assistantChatRuns?.clear();
  });

  it("skips resumable streams when Redis is not configured", () => {
    expect(getChatStreamContext()).toBeNull();
  });

  it("stops a run on the same instance without Redis", async () => {
    const run = await startChatRun("stream-1");

    await stopChatRun("stream-1", logger);

    expect(run.abortSignal.aborted).toBe(true);
  });

  it("aborts a run when another instance publishes its stop", async () => {
    envState.REDIS_URL = "redis://localhost:6379";
    const run = await startChatRun("stream-1");
    const otherRun = await startChatRun("stream-2");
    // Another instance has its own connection to the same Redis.
    const otherInstance = new Redis();

    await otherInstance.publish("assistant-chat:stop", "stream-1");

    expect(run.abortSignal.aborted).toBe(true);
    expect(otherRun.abortSignal.aborted).toBe(false);
  });

  it("listens for stops before a run starts", async () => {
    envState.REDIS_URL = "redis://localhost:6379";
    let openSubscription = () => {};
    redisBus.subscribeGate = new Promise((resolve) => {
      openSubscription = resolve;
    });

    let started = false;
    const runPromise = startChatRun("stream-1").then((run) => {
      started = true;
      return run;
    });
    await Promise.resolve();
    expect(started).toBe(false);

    openSubscription();
    const run = await runPromise;
    await new Redis().publish("assistant-chat:stop", "stream-1");

    expect(run.abortSignal.aborted).toBe(true);
  });

  it("ignores stops after the run has ended", async () => {
    envState.REDIS_URL = "redis://localhost:6379";
    const run = await startChatRun("stream-1");
    run.end();

    await stopChatRun("stream-1", logger);

    expect(run.abortSignal.aborted).toBe(false);
  });

  it("claims a chat only when no live reply holds it", async () => {
    prisma.chat.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      claimActiveStream({ chatId: "chat-1", streamId: "stream-2" }),
    ).resolves.toBe(false);

    const { where } = prisma.chat.updateMany.mock.calls[0]![0];
    expect(where).toMatchObject({ id: "chat-1" });
    expect(where?.OR).toEqual(
      expect.arrayContaining([
        { activeStreamId: null },
        { activeStreamStartedAt: { lt: expect.any(Date) } },
      ]),
    );
  });

  it("does not throw when clearing the marker fails", async () => {
    prisma.chat.updateMany.mockRejectedValueOnce(new Error("db down"));

    await expect(
      clearActiveStream({ chatId: "chat-1", streamId: "stream-1" }),
    ).resolves.toBeUndefined();
    expect(prisma.chat.updateMany).toHaveBeenCalledOnce();
  });

  it("treats a marker older than the run time limit as stale", () => {
    expect(
      getLiveStreamId({
        activeStreamId: "stream-1",
        activeStreamStartedAt: new Date(Date.now() - 60_000),
      }),
    ).toBe("stream-1");
    expect(
      getLiveStreamId({
        activeStreamId: "stream-1",
        activeStreamStartedAt: new Date(Date.now() - 801_000),
      }),
    ).toBeNull();
  });
});
