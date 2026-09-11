import { describe, expect, it, vi } from "vitest";
import { createThreadRequest, fetchThreadRequest } from "./thread-request";

import { invalidateThreadCaches } from "./thread-invalidation";

describe("thread requests", () => {
  it("encodes provider thread IDs in the route path", () => {
    const request = createThreadRequest({
      emailAccountId: "account-1",
      threadId: "AAMk+/= folder",
      options: { includeDrafts: true },
    });

    expect(request.key[0]).toBe(
      "/api/threads/AAMk%2B%2F%3D%20folder?includeDrafts=true",
    );
    expect(request.cacheIdentity).toContain("AAMk+/= folder");
  });

  it("refetches when sync invalidates an in-flight response", async () => {
    const response = Promise.withResolvers<string>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue("current");
    const request = createThreadRequest({
      emailAccountId: "account-race",
      threadId: "thread-1",
    });
    const pending = fetchThreadRequest(request, fetcher);
    invalidateThreadCaches({
      emailAccountId: "account-race",
      threadIds: ["thread-1"],
      reset: false,
    });
    response.resolve("stale");
    await expect(pending).resolves.toBe("current");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares an in-flight response for the same cache identity", async () => {
    const response = Promise.withResolvers<{ id: string }>();
    const fetcher = vi.fn(() => response.promise);
    const request = createThreadRequest({
      emailAccountId: "account-1",
      threadId: "thread-1",
    });

    const first = fetchThreadRequest(request, fetcher);
    const second = fetchThreadRequest(request, fetcher);

    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(1);

    response.resolve({ id: "thread-1" });
    await expect(first).resolves.toEqual({ id: "thread-1" });
  });
});
