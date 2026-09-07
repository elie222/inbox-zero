import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPageBuffer } from "@/utils/threads/page-buffer";

const { redisConfig } = vi.hoisted(() => ({
  redisConfig: {
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "test-token" as string | undefined,
  },
}));
vi.mock("@/env", () => ({ env: redisConfig }));
const { redis } = vi.hoisted(() => ({ redis: { get: vi.fn(), set: vi.fn() } }));
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(function () {
    return redis;
  }),
}));

const values = new Map<string, string>();

beforeEach(() => {
  vi.clearAllMocks();
  values.clear();
  vi.mocked(redis.get).mockImplementation(
    async (key) => values.get(key) ?? null,
  );
  vi.mocked(redis.set).mockImplementation(async (key, value) => {
    values.set(key, value as string);
    return "OK";
  });
});

describe("thread page buffers", () => {
  it("shares pages between instances while preserving dates and metadata", async () => {
    const page = {
      items: [
        { id: "thread", date: new Date("2026-01-01"), optional: undefined },
      ],
      nextPageToken: "next",
      meta: ["label"],
    };
    const firstInstance = createPageBuffer<
      (typeof page.items)[number],
      string[]
    >(scope())!;
    const id = await firstInstance.write({ sourceId: "source", page });
    expect(id).toEqual(expect.any(String));
    const secondInstance = createPageBuffer<
      (typeof page.items)[number],
      string[]
    >(scope())!;
    expect(await secondInstance.read({ sourceId: "source", id: id! })).toEqual(
      page,
    );
    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { ex: 300 },
    );
  });

  it("does not expose a buffer to a different account, query, or source", async () => {
    const buffer = createPageBuffer(scope())!;
    const id = await buffer.write({
      sourceId: "source-1",
      page: { items: [{ id: "thread" }] },
    });
    expect(
      await createPageBuffer(scope("account-2"))!.read({
        sourceId: "source-1",
        id: id!,
      }),
    ).toBeUndefined();
    expect(
      await createPageBuffer(scope("account-1", "query-2"))!.read({
        sourceId: "source-1",
        id: id!,
      }),
    ).toBeUndefined();
    expect(
      await buffer.read({ sourceId: "source-2", id: id! }),
    ).toBeUndefined();
  });

  it("treats expired, malformed, and unavailable buffers as cache misses", async () => {
    const buffer = createPageBuffer(scope())!;
    const id = await buffer.write({ sourceId: "source", page: { items: [] } });
    values.clear();
    expect(await buffer.read({ sourceId: "source", id: id! })).toBeUndefined();
    vi.mocked(redis.get).mockResolvedValueOnce("invalid binary data");
    expect(await buffer.read({ sourceId: "source", id: id! })).toBeUndefined();
    vi.mocked(redis.get).mockRejectedValueOnce(new Error("Unavailable"));
    expect(await buffer.read({ sourceId: "source", id: id! })).toBeUndefined();
    vi.mocked(redis.set).mockRejectedValueOnce(new Error("Unavailable"));
    expect(
      await buffer.write({ sourceId: "source", page: { items: [] } }),
    ).toBeUndefined();
  });

  it("does not store oversized pages", async () => {
    const buffer = createPageBuffer(scope())!;
    expect(
      await buffer.write({
        sourceId: "source",
        page: { items: ["x".repeat(1024 * 1024)] },
      }),
    ).toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("does not query Redis with an invalid buffer identifier", async () => {
    expect(
      await createPageBuffer(scope())!.read({
        sourceId: "source",
        id: "another:key",
      }),
    ).toBeUndefined();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("does not send buffered mail over cleartext HTTP", () => {
    const url = redisConfig.UPSTASH_REDIS_URL;
    redisConfig.UPSTASH_REDIS_URL = "http://redis.example.com";
    try {
      expect(createPageBuffer(scope())).toBeUndefined();
    } finally {
      redisConfig.UPSTASH_REDIS_URL = url;
    }
  });

  it("disables buffering when Redis is not configured", () => {
    const token = redisConfig.UPSTASH_REDIS_TOKEN;
    redisConfig.UPSTASH_REDIS_TOKEN = undefined;
    try {
      expect(createPageBuffer(scope())).toBeUndefined();
    } finally {
      redisConfig.UPSTASH_REDIS_TOKEN = token;
    }
  });
});

function scope(emailAccountId = "account-1", labelId = "query-1") {
  return {
    kind: "labels" as const,
    emailAccountId,
    messageFormat: "metadata" as const,
    maxResults: 50,
    query: { labelId },
  };
}
