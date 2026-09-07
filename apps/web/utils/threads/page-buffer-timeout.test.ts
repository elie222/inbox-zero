import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPageBuffer } from "@/utils/threads/page-buffer";

vi.mock("@/env", () => ({
  env: {
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "test-token",
  },
}));

afterEach(() => vi.unstubAllGlobals());

describe("page buffer request deadlines", () => {
  it.each([
    "read",
    "write",
  ] as const)("aborts a stalled %s without retrying", async (operation) => {
    const signals: AbortSignal[] = [];
    const fetch = vi.fn(
      (_url: unknown, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = options.signal!;
          signals.push(signal);
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const buffer = createPageBuffer({
      kind: "labels",
      emailAccountId: "account",
      messageFormat: "metadata",
      maxResults: 50,
      query: {},
    })!;
    const result =
      operation === "read"
        ? await buffer.read({ sourceId: "source", id: randomUUID() })
        : await buffer.write({ sourceId: "source", page: { items: [] } });
    expect(result).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(true);
  });
});
