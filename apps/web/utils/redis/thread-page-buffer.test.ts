import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPageBuffer,
  withThreadPageBufferDeletion,
} from "@/utils/redis/thread-page-buffer";

const { redisConfig } = vi.hoisted(() => ({
  redisConfig: {
    EMAIL_ENCRYPT_SECRET: "test-encryption-secret",
    EMAIL_ENCRYPT_SALT: "test-encryption-salt",
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "test-token" as string | undefined,
  },
}));
vi.mock("@/env", () => ({ env: redisConfig }));
const { redis } = vi.hoisted(() => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    eval: vi.fn(),
    scan: vi.fn(),
    del: vi.fn(),
  },
}));
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(function () {
    return redis;
  }),
}));

const values = new Map<string, string>();
const owners = new Map<string, Set<string>>();

beforeEach(() => {
  vi.clearAllMocks();
  values.clear();
  owners.clear();
  vi.mocked(redis.get).mockImplementation(
    async (key) => values.get(key) ?? null,
  );
  vi.mocked(redis.set).mockImplementation(async (key, value) => {
    values.set(key, value as string);
    return "OK";
  });
  vi.mocked(redis.eval).mockImplementation(
    async (script, [marker, key], [value]) => {
      if (script.includes('"SCARD"')) {
        const tokens = owners.get(marker) ?? new Set<string>();
        tokens.delete(value);
        owners.set(marker, tokens);
        values.set(marker, String(tokens.size));
        return tokens.size;
      }
      if (script.includes('"PERSIST"')) {
        const tokens = owners.get(marker) ?? new Set<string>();
        tokens.add(value);
        owners.set(marker, tokens);
        values.set(marker, String(tokens.size));
        return 1;
      }
      if (values.has(marker)) return 0;
      values.set(key, value);
      return 1;
    },
  );
  vi.mocked(redis.scan).mockImplementation(async (_cursor, { match }) => [
    0,
    [...values.keys()].filter((key) => key.startsWith(match.slice(0, -1))),
  ]);
  vi.mocked(redis.del).mockImplementation(async (...keys) => {
    keys.forEach((key) => values.delete(key));
    return keys.length;
  });
});

describe("thread page buffers", () => {
  it("stores encrypted content and rejects unencrypted or tampered values", async () => {
    const buffer = createPageBuffer(scope())!;
    const page = {
      items: [{ subject: "synthetic subject", body: "synthetic body" }],
    };
    const id = await buffer.write({ sourceId: "source", page });
    if (!id) throw new Error("Expected a stored page");
    const [key, encoded] = [...values.entries()][0];
    expect(encoded).not.toContain("synthetic");
    expect(encoded).toMatch(/^v1:[a-f0-9]+$/);
    expect(await buffer.read({ sourceId: "source", id })).toEqual(page);
    values.set(
      key,
      `${encoded.slice(0, -2)}${encoded.endsWith("00") ? "ff" : "00"}`,
    );
    expect(await buffer.read({ sourceId: "source", id })).toBeUndefined();
    values.set(key, JSON.stringify(page));
    expect(await buffer.read({ sourceId: "source", id })).toBeUndefined();
  });

  it("rejects encrypted payloads copied from another account key", async () => {
    const first = createPageBuffer(scope())!;
    const second = createPageBuffer(scope("account-2"))!;
    await first.write({ sourceId: "label", page: { items: ["first"] } });
    const secondId = await second.write({
      sourceId: "label",
      page: { items: ["second"] },
    });
    const [[, firstValue], [secondKey]] = [...values.entries()];
    values.set(secondKey, firstValue);
    expect(
      await second.read({ sourceId: "label", id: secondId! }),
    ).toBeUndefined();
  });

  it("removes every account buffer and blocks writes from in-flight loaders", async () => {
    const labels = createPageBuffer(scope())!;
    const combined = createPageBuffer({
      kind: "combined",
      userId: "user",
      query: {
        q: undefined,
        labelNames: [],
        isUnread: undefined,
        limit: 20,
      },
    })!;
    const other = createPageBuffer(scope("account-2"))!;
    const page = { items: [{ id: "thread" }] };
    const labelId = await labels.write({ sourceId: "label", page });
    const combinedId = await combined.write({ sourceId: "account-1", page });
    const otherId = await other.write({ sourceId: "label", page });
    await withThreadPageBufferDeletion(["account-1"], async () => {});
    expect(
      await labels.read({ sourceId: "label", id: labelId! }),
    ).toBeUndefined();
    expect(
      await combined.read({ sourceId: "account-1", id: combinedId! }),
    ).toBeUndefined();
    expect(await other.read({ sourceId: "label", id: otherId! })).toEqual(page);
    expect(await labels.write({ sourceId: "label", page })).toBeUndefined();
    expect(
      await combined.write({ sourceId: "account-1", page }),
    ).toBeUndefined();
  });

  it("does not let old loaders write after the deletion marker expires", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      const buffer = createPageBuffer(scope())!;
      await withThreadPageBufferDeletion(["account-1"], async () => {});
      values.clear();
      now.mockReturnValue(300_001);
      expect(
        await buffer.write({ sourceId: "label", page: { items: [] } }),
      ).toBeUndefined();
      expect(values.size).toBe(0);
    } finally {
      now.mockRestore();
    }
  });

  it("blocks fresh loaders throughout long-running and overlapping deletions", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      await withThreadPageBufferDeletion(["account-1"], async () => {
        await withThreadPageBufferDeletion(["account-1"], async () => {});
        expect([...values.values()]).toEqual(["1"]);
        now.mockReturnValue(600_000);
        const freshBuffer = createPageBuffer(scope())!;
        expect(
          await freshBuffer.write({ sourceId: "label", page: { items: [] } }),
        ).toBeUndefined();
        expect([...values.values()]).toEqual(["1"]);
      });
      expect([...values.values()]).toEqual(["0"]);
    } finally {
      now.mockRestore();
    }
  });

  it("releases an acquired guard after a lost response without releasing another owner", async () => {
    await withThreadPageBufferDeletion(["account-1"], async () => {
      const evaluate = redis.eval.getMockImplementation()!;
      redis.eval.mockImplementationOnce(async (...args) => {
        await evaluate(...args);
        throw new Error("Response lost");
      });
      const operation = vi.fn();
      await expect(
        withThreadPageBufferDeletion(["account-1"], operation),
      ).rejects.toThrow("Response lost");
      expect(operation).not.toHaveBeenCalled();
      expect([...values.values()]).toEqual(["1"]);
    });
    expect([...values.values()]).toEqual(["0"]);
  });

  it("releases deletion guards after a failed account deletion", async () => {
    await expect(
      withThreadPageBufferDeletion(["account-1"], async () => {
        throw new Error("Deletion failed");
      }),
    ).rejects.toThrow("Deletion failed");
    expect([...values.values()]).toEqual(["0"]);
  });

  it("propagates deletion failures so callers can retry before deleting the account", async () => {
    vi.mocked(redis.scan).mockRejectedValueOnce(new Error("Unavailable"));
    await expect(
      withThreadPageBufferDeletion(["account-1"], async () => {}),
    ).rejects.toThrow("Unavailable");
  });

  it("disables buffering without encryption settings", () => {
    const secret = redisConfig.EMAIL_ENCRYPT_SECRET;
    redisConfig.EMAIL_ENCRYPT_SECRET = "";
    try {
      expect(createPageBuffer(scope())).toBeUndefined();
    } finally {
      redisConfig.EMAIL_ENCRYPT_SECRET = secret;
    }
  });

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
    if (!id) throw new Error("Expected a stored page");
    const secondInstance = createPageBuffer<
      (typeof page.items)[number],
      string[]
    >(scope())!;
    expect(await secondInstance.read({ sourceId: "source", id })).toEqual(page);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      [expect.stringMatching(/^v1:/), 300],
    );
  });

  it("does not expose a buffer to a different account, query, or source", async () => {
    const buffer = createPageBuffer(scope())!;
    const id = await buffer.write({
      sourceId: "source-1",
      page: { items: [{ id: "thread" }] },
    });
    if (!id) throw new Error("Expected a stored page");
    expect(
      await createPageBuffer(scope("account-2"))!.read({
        sourceId: "source-1",
        id,
      }),
    ).toBeUndefined();
    expect(
      await createPageBuffer(scope("account-1", "query-2"))!.read({
        sourceId: "source-1",
        id,
      }),
    ).toBeUndefined();
    expect(await buffer.read({ sourceId: "source-2", id })).toBeUndefined();
  });

  it("treats expired, malformed, and unavailable buffers as cache misses", async () => {
    const buffer = createPageBuffer(scope())!;
    const id = await buffer.write({ sourceId: "source", page: { items: [] } });
    if (!id) throw new Error("Expected a stored page");
    values.clear();
    expect(await buffer.read({ sourceId: "source", id })).toBeUndefined();
    vi.mocked(redis.get).mockResolvedValueOnce("invalid binary data");
    expect(await buffer.read({ sourceId: "source", id })).toBeUndefined();
    vi.mocked(redis.get).mockRejectedValueOnce(new Error("Unavailable"));
    expect(await buffer.read({ sourceId: "source", id })).toBeUndefined();
    vi.mocked(redis.eval).mockRejectedValueOnce(new Error("Unavailable"));
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
    expect(redis.eval).not.toHaveBeenCalled();
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
