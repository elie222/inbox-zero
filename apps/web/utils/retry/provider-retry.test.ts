import { describe, expect, it } from "vitest";
import { getRetryAfterDelayMs } from "./provider-retry";

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
