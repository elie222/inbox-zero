import { describe, expect, it, vi } from "vitest";
import { createThreadRequest, fetchThreadRequest } from "./thread-request";

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
