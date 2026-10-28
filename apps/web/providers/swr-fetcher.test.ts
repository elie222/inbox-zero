import { afterEach, describe, expect, it, vi } from "vitest";
import { swrFetcher } from "./swr-fetcher";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("swrFetcher", () => {
  it("replaces the browser's opaque network error with a readable one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(swrFetcher("/api/user/email-account")).rejects.toThrow(
      "Couldn't connect to Inbox Zero. Check your internet connection and try again.",
    );
  });

  it("lets aborted requests through unchanged", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    await expect(swrFetcher("/api/user/email-account")).rejects.toBe(abort);
  });
});
