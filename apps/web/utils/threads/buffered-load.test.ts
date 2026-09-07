import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { loadThreads, toListThreads } from "@/utils/threads/load";
import { loadCombinedThreads } from "@/utils/threads/load-combined";
import { createPageBuffer } from "@/utils/threads/page-buffer";

vi.mock("@/env", () => ({
  env: {
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "test-token",
  },
}));
const { redis } = vi.hoisted(() => ({ redis: { get: vi.fn(), set: vi.fn() } }));
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(function () {
    return redis;
  }),
}));
vi.mock("@/utils/prisma");

beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  vi.mocked(redis.get).mockImplementation(
    async (key) => values.get(key) ?? null,
  );
  vi.mocked(redis.set).mockImplementation(async (key, value) => {
    values.set(key, value as string);
    return "OK";
  });
  prisma.executedRule.findMany.mockResolvedValue([]);
});

describe("buffered thread loaders", () => {
  it("reuses each label's unused rows across loadThreads requests", async () => {
    const emailProvider = {
      getThreadsWithQuery: vi.fn(async ({ query }) => ({
        threads: query.labelIds.includes("a")
          ? [thread("first", 4), thread("fourth", 1)]
          : [thread("second", 3), thread("third", 2)],
      })),
    };
    const load = (nextPageToken?: string) =>
      loadThreads({
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        messageFormat: "metadata",
        query: { anyLabelIds: ["a", "b"], limit: 2, nextPageToken },
      });
    const first = await load();
    const second = await load(first.nextPageToken);
    expect(first.threads.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(second.threads.map(({ id }) => id)).toEqual(["third", "fourth"]);
    expect(emailProvider.getThreadsWithQuery).toHaveBeenCalledTimes(2);
    expect(second.nextPageToken).toBeUndefined();
  });

  it("does not reuse another account's buffered label rows", async () => {
    const emailProvider = {
      getThreadsWithQuery: vi.fn().mockResolvedValue({
        threads: [thread("first", 4), thread("old-account", 1)],
      }),
    };
    const first = await loadThreads({
      emailAccountId: "account-1",
      emailProvider: emailProvider as never,
      messageFormat: "metadata",
      query: { anyLabelIds: ["a", "b"], limit: 1 },
    });
    emailProvider.getThreadsWithQuery.mockResolvedValue({
      threads: [thread("current-account", 2)],
    });
    const second = await loadThreads({
      emailAccountId: "account-2",
      emailProvider: emailProvider as never,
      messageFormat: "metadata",
      query: {
        anyLabelIds: ["a", "b"],
        limit: 1,
        nextPageToken: first.nextPageToken,
      },
    });
    expect(second.threads.map(({ id }) => id)).toEqual(["current-account"]);
    expect(emailProvider.getThreadsWithQuery).toHaveBeenCalledTimes(4);
  });

  it("skips provider and enrichment calls for buffered combined-account rows", async () => {
    const emailProvider = {
      getThreadsWithQuery: vi.fn(async ({ query }) => ({
        threads:
          query.labelId === "a"
            ? [thread("first", 4), thread("fourth", 1)]
            : [thread("second", 3), thread("third", 2)],
      })),
    };
    const loadPage = vi.fn(
      async ({ account }: { account: { id: string } }) => ({
        ...toListThreads(
          await loadThreads({
            emailAccountId: account.id,
            emailProvider: emailProvider as never,
            messageFormat: "metadata",
            query: { labelId: account.id, limit: 2 },
          }),
        ),
        labels: [{ id: account.id, name: account.id, type: "user" }],
      }),
    );
    const load = (cursor: string | null) =>
      loadCombinedThreads({
        accounts: ["a", "b"].map((id) => ({
          id,
          email: `${id}@example.com`,
          name: null,
          image: null,
          provider: "google",
        })),
        cursor,
        limit: 2,
        loadPage,
        logger: createScopedLogger("test"),
        pageBuffer: createPageBuffer({
          kind: "combined",
          userId: "user",
          query: {
            q: undefined,
            labelNames: [],
            isUnread: undefined,
            limit: 2,
          },
        }),
      });
    const first = await load(null);
    const second = await load(first.nextPageToken);
    expect(first.threads.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(second.threads.map(({ id }) => id)).toEqual(["third", "fourth"]);
    expect(second.labelsByAccount).toEqual(first.labelsByAccount);
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(emailProvider.getThreadsWithQuery).toHaveBeenCalledTimes(2);
    expect(prisma.executedRule.findMany).toHaveBeenCalledTimes(2);
  });
});

function thread(id: string, rank: number) {
  return {
    id,
    snippet: id,
    messages: [
      {
        id: `${id}-message`,
        threadId: id,
        internalDate: String(rank * 1000),
        headers: { from: "sender@example.com" },
      },
    ],
  };
}
