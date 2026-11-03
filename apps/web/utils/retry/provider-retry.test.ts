import { describe, expect, it } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { getRetryAfterDelayMs, withProviderRetry } from "./provider-retry";

describe("withProviderRetry", () => {
  it("does not wait out the backoff after the last failed attempt", async () => {
    const rateLimited = new Error("rate limited");
    let attempts = 0;
    const startedAt = Date.now();
    await expect(
      withProviderRetry(
        async () => {
          attempts++;
          throw rateLimited;
        },
        {
          classify: (attempt) => ({
            delayMs: attempt.attemptNumber === 1 ? 10 : 5000,
            isRateLimit: true,
            logFields: {},
            retryable: true,
          }),
          logger: createScopedLogger("provider-retry-test"),
          maxBlockingDelayMs: 10_000,
          maxRetries: 1,
          providerName: "Test",
          retryPolicy: "all",
        },
      ),
    ).rejects.toBe(rateLimited);
    expect(attempts).toBe(2);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});

describe("getRetryAfterDelayMs", () => {
  it("uses Retry-After header in seconds", () => {
    expect(getRetryAfterDelayMs("10")).toBe(10_000);
    expect(getRetryAfterDelayMs("0")).toBe(0);
  });

  it("uses Retry-After header as HTTP-date", () => {
    const futureDate = new Date(Date.now() + 5000);
    const delay = getRetryAfterDelayMs(futureDate.toUTCString());
    expect(delay).toBeGreaterThanOrEqual(4000);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it("lets callers fall back when Retry-After header is stale", () => {
    const pastDate = new Date(Date.now() - 5000).toUTCString();
    expect(getRetryAfterDelayMs(pastDate)).toBeUndefined();
  });

  it("lets callers fall back when Retry-After header is missing or invalid", () => {
    expect(getRetryAfterDelayMs(undefined)).toBeUndefined();
    expect(getRetryAfterDelayMs("not a date")).toBeUndefined();
  });
});
