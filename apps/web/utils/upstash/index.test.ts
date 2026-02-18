import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBatchJSON = vi.fn();
const mockPublishJSON = vi.fn();
const mockQueueEnqueueJSON = vi.fn();
const mockQueueUpsert = vi.fn();

function setupFetchMock() {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loadUpstashModule({ qstashToken }: { qstashToken?: string }) {
  vi.resetModules();
  vi.clearAllMocks();

  const MockClient = vi.fn(function MockClient() {
    return {
      publishJSON: mockPublishJSON,
      batchJSON: mockBatchJSON,
      queue: vi.fn(() => ({
        upsert: mockQueueUpsert,
        enqueueJSON: mockQueueEnqueueJSON,
      })),
    };
  });

  vi.doMock("@upstash/qstash", () => ({
    Client: MockClient,
  }));

  vi.doMock("next/server", () => ({
    after: (callback: () => Promise<void>) => {
      callback();
    },
  }));

  vi.doMock("@/env", () => ({
    env: {
      QSTASH_TOKEN: qstashToken,
      NEXT_PUBLIC_BASE_URL: "http://web:3000",
      INTERNAL_API_KEY: "internal-api-key",
    },
  }));

  vi.doMock("@/utils/internal-api", () => ({
    INTERNAL_API_KEY_HEADER: "x-api-key",
    getInternalApiUrl: () => "http://web:3000",
  }));

  return import("./index");
}

describe("publishToQstash", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses internal base URL for QStash when configured", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: "token" });

    await upstash.publishToQstash("/api/process", { id: 1 });

    expect(mockPublishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://web:3000/api/process",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to internal URL when QStash client is unavailable", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: undefined });

    await upstash.publishToQstash("/api/process", { id: 1 });

    expect(mockPublishJSON).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://web:3000/api/process",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("handles trailing slash on INTERNAL_API_URL", async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const MockClient = vi.fn(function MockClient() {
      return {
        publishJSON: mockPublishJSON,
        batchJSON: mockBatchJSON,
        queue: vi.fn(() => ({
          upsert: mockQueueUpsert,
          enqueueJSON: mockQueueEnqueueJSON,
        })),
      };
    });

    vi.doMock("@upstash/qstash", () => ({ Client: MockClient }));
    vi.doMock("next/server", () => ({
      after: (callback: () => Promise<void>) => {
        callback();
      },
    }));
    vi.doMock("@/env", () => ({
      env: {
        QSTASH_TOKEN: "token",
        NEXT_PUBLIC_BASE_URL: "https://public.example.com",
        INTERNAL_API_KEY: "internal-api-key",
      },
    }));
    vi.doMock("@/utils/internal-api", () => ({
      INTERNAL_API_KEY_HEADER: "x-api-key",
      getInternalApiUrl: () => "http://web:3000/",
    }));

    const upstash = await import("./index");
    setupFetchMock();

    await upstash.publishToQstash("/api/process", { id: 1 });

    expect(mockPublishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://web:3000/api/process",
      }),
    );
  });
});

describe("bulkPublishToQstash", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses internal base URL for QStash when configured", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: "token" });

    await upstash.bulkPublishToQstash({
      items: [
        { path: "/api/task-one", body: { id: 1 } },
        { path: "/api/task-two", body: { id: 2 } },
      ],
    });

    expect(mockBatchJSON).toHaveBeenCalledTimes(1);
    const [batchItems] = mockBatchJSON.mock.calls[0];
    expect(batchItems).toHaveLength(2);
    expect(batchItems[0].url).toBe("http://web:3000/api/task-one");
    expect(batchItems[1].url).toBe("http://web:3000/api/task-two");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to internal URL for all items when QStash client is unavailable", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: undefined });

    await upstash.bulkPublishToQstash({
      items: [
        { path: "/api/task-one", body: { id: 1 } },
        { path: "/api/task-two", body: { id: 2 } },
      ],
    });

    expect(mockBatchJSON).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://web:3000/api/task-one",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://web:3000/api/task-two",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("publishToQstashQueue", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses internal base URL for QStash when configured", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: "token" });

    await upstash.publishToQstashQueue({
      queueName: "test",
      parallelism: 1,
      path: "/api/task",
      body: { id: "a" },
    });

    expect(mockQueueEnqueueJSON).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://web:3000/api/task" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to internal URL when QStash client is unavailable", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: undefined });

    await upstash.publishToQstashQueue({
      queueName: "test",
      parallelism: 1,
      path: "/api/task",
      body: { id: "a" },
    });

    expect(mockQueueUpsert).not.toHaveBeenCalled();
    expect(mockQueueEnqueueJSON).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://web:3000/api/task",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
