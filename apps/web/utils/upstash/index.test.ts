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
      NEXT_PUBLIC_BASE_URL: "https://public.example.com",
      INTERNAL_API_KEY: "internal-api-key",
    },
  }));

  vi.doMock("@/utils/internal-api", () => ({
    INTERNAL_API_KEY_HEADER: "x-api-key",
    getInternalApiUrl: () => "http://web:3000",
  }));

  return import("./index");
}

describe("bulkPublishToQstash", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses QStash for reachable items and fallback only for unreachable items", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: "token" });

    await upstash.bulkPublishToQstash({
      items: [
        {
          url: "http://web:3000/api/internal",
          body: { id: 1 },
        },
        {
          url: "https://api.example.com/task",
          body: { id: 2 },
        },
        {
          url: "http://10.0.0.1/private",
          body: { id: 3 },
        },
      ],
    });

    expect(mockBatchJSON).toHaveBeenCalledTimes(1);
    const [batchItems] = mockBatchJSON.mock.calls[0];
    expect(batchItems).toHaveLength(2);
    expect(batchItems[0].url).toBe("https://public.example.com/api/internal");
    expect(batchItems[1].url).toBe("https://api.example.com/task");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://10.0.0.1/private",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("falls back for all items when QStash client is unavailable", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: undefined });

    await upstash.bulkPublishToQstash({
      items: [
        { url: "https://api.example.com/one", body: { id: 1 } },
        { url: "https://api.example.com/two", body: { id: 2 } },
      ],
    });

    expect(mockBatchJSON).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("publishToQstashQueue", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back for link-local and cgnat URLs", async () => {
    const fetchMock = setupFetchMock();
    const upstash = await loadUpstashModule({ qstashToken: "token" });

    await upstash.publishToQstashQueue({
      queueName: "test",
      parallelism: 1,
      url: "http://169.254.1.10/task",
      body: { id: "a" },
    });
    await upstash.publishToQstashQueue({
      queueName: "test",
      parallelism: 1,
      url: "http://100.64.1.10/task",
      body: { id: "b" },
    });

    expect(mockQueueUpsert).not.toHaveBeenCalled();
    expect(mockQueueEnqueueJSON).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://169.254.1.10/task",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://100.64.1.10/task",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
