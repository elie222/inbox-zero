import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

describe("forwardQueueMessageToInternalApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses shared internal API headers when forwarding queue messages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    vi.doMock("@/utils/internal-api", () => ({
      getInternalApiUrl: () => "https://worker.example.com",
      getInternalApiHeaders: () => ({
        "x-api-key": "internal-api-key",
        "x-inbox-zero-caller-id": "worker.example.com",
      }),
    }));

    const { forwardQueueMessageToInternalApi } = await import(
      "./forward-to-internal-api"
    );

    await forwardQueueMessageToInternalApi({
      path: "/api/test",
      body: { id: "job-1" },
      logger: createTestLogger(),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example.com/api/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "job-1" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-api-key": "internal-api-key",
          "x-inbox-zero-caller-id": "worker.example.com",
        }),
      }),
    );
  });
});
