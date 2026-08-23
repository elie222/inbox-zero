// @vitest-environment jsdom

import { unstable_serialize } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThreadPrefetchCoordinator } from "./thread-prefetch-coordinator";
import {
  createThreadRequest,
  fetchThreadRequest,
} from "@/utils/email-cache/thread-request";

const threadPrefetch = vi.hoisted(() => ({
  prefetch: vi.fn(),
  shouldPrefetch: vi.fn(),
}));

vi.mock("./thread-prefetch", () => ({
  prefetchThreadDetail: threadPrefetch.prefetch,
  shouldPrefetchThreads: threadPrefetch.shouldPrefetch,
}));

describe("createThreadPrefetchCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    threadPrefetch.shouldPrefetch.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs at most two prefetches at a time", async () => {
    const resolvers = new Map<string, () => void>();
    threadPrefetch.prefetch.mockImplementation(
      ({ threadId }: { threadId: string }) =>
        new Promise<void>((resolve) => {
          resolvers.set(threadId, resolve);
        }),
    );
    const coordinator = createCoordinator();

    coordinator.scheduleMany([
      job("thread-1"),
      job("thread-2"),
      job("thread-3"),
    ]);

    expect(getCalledThreadIds()).toEqual(["thread-1", "thread-2"]);

    resolvers.get("thread-1")?.();
    await vi.waitFor(() =>
      expect(getCalledThreadIds()).toEqual([
        "thread-1",
        "thread-2",
        "thread-3",
      ]),
    );
  });

  it("dedupes by cache identity and upgrades a queued thread to the higher priority", async () => {
    const resolvers = new Map<string, () => void>();
    threadPrefetch.prefetch.mockImplementation(
      ({ threadId }: { threadId: string }) =>
        new Promise<void>((resolve) => {
          resolvers.set(threadId, resolve);
        }),
    );
    const coordinator = createCoordinator();

    coordinator.schedule(job("thread-1", "focused"));
    coordinator.schedule(job("thread-2", "focused"));
    coordinator.schedule(job("thread-3", "nearby"));
    coordinator.schedule(job("thread-4", "focused"));
    coordinator.schedule(job("thread-3", "hover"));

    expect(getCalledThreadIds()).toEqual(["thread-1", "thread-2"]);

    resolvers.get("thread-1")?.();
    await vi.waitFor(() =>
      expect(getCalledThreadIds()).toEqual([
        "thread-1",
        "thread-2",
        "thread-3",
      ]),
    );
    expect(
      getCalledThreadIds().filter((threadId) => threadId === "thread-3"),
    ).toHaveLength(1);
  });

  it("drops queued jobs and marks active jobs stale when their scope is cancelled", async () => {
    const activeJobs: Array<{ isCancelled?: () => boolean; threadId: string }> =
      [];
    const resolvers = new Map<string, () => void>();
    threadPrefetch.prefetch.mockImplementation(
      (input: { isCancelled?: () => boolean; threadId: string }) =>
        new Promise<void>((resolve) => {
          activeJobs.push(input);
          resolvers.set(input.threadId, resolve);
        }),
    );
    const coordinator = createCoordinator();

    coordinator.scheduleMany([
      job("thread-1"),
      job("thread-2"),
      job("thread-3"),
    ]);
    coordinator.cancelScope("scope-a");

    expect(activeJobs.every((job) => job.isCancelled?.())).toBe(true);

    resolvers.get("thread-1")?.();
    await Promise.resolve();
    expect(getCalledThreadIds()).toEqual(["thread-1", "thread-2"]);
  });

  it("skips prefetch when the thread is already in SWR cache", () => {
    const request = createThreadRequest({
      emailAccountId: "account-1",
      threadId: "thread-1",
      options: { includeDrafts: true },
    });
    const cache = new Map([
      [
        unstable_serialize(request.key),
        { data: { thread: { id: "thread-1" } } },
      ],
    ]);
    const coordinator = createCoordinator({ cache });

    coordinator.schedule(job("thread-1"));

    expect(threadPrefetch.prefetch).not.toHaveBeenCalled();
  });

  it("skips prefetch when the same thread request is already in flight", () => {
    const request = createThreadRequest({
      emailAccountId: "account-1",
      threadId: "thread-1",
      options: { includeDrafts: true },
    });
    const release = Promise.withResolvers<void>();
    fetchThreadRequest(request, () => release.promise);
    const coordinator = createCoordinator();

    coordinator.schedule(job("thread-1"));

    expect(threadPrefetch.prefetch).not.toHaveBeenCalled();
    release.resolve();
  });

  it("respects the shared network gate", () => {
    threadPrefetch.shouldPrefetch.mockReturnValue(false);
    const coordinator = createCoordinator();

    coordinator.schedule(job("thread-1"));

    expect(threadPrefetch.prefetch).not.toHaveBeenCalled();
  });

  it("reactivates after lifecycle cleanup without reviving stale jobs", () => {
    threadPrefetch.prefetch.mockImplementation(() => new Promise(() => {}));
    const coordinator = createCoordinator();

    coordinator.schedule(job("thread-1"));
    const firstJob = threadPrefetch.prefetch.mock.calls[0]?.[0] as {
      isCancelled?: () => boolean;
    };

    coordinator.dispose();
    coordinator.activate();
    coordinator.schedule(job("thread-2"));

    expect(firstJob.isCancelled?.()).toBe(true);
    expect(getCalledThreadIds()).toEqual(["thread-1", "thread-2"]);
  });
});

function createCoordinator({
  cache = new Map(),
}: {
  cache?: Map<string, unknown>;
} = {}) {
  return createThreadPrefetchCoordinator({
    cache,
    fetcher: vi.fn(),
    mutate: vi.fn().mockResolvedValue(undefined),
  });
}

function getCalledThreadIds() {
  return threadPrefetch.prefetch.mock.calls.map(
    ([input]: [{ threadId: string }]) => input.threadId,
  );
}

function job(threadId: string, priority = "focused") {
  return {
    emailAccountId: "account-1",
    priority: priority as "adjacent" | "focused" | "hover" | "nearby",
    scopeKey: "scope-a",
    threadId,
  };
}
